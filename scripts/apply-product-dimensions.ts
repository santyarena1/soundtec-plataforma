/**
 * Aplica correcciones de medidas físicas (Etapa 1: plano 2D a escala).
 *
 *   npx tsx scripts/apply-product-dimensions.ts [--file <changes.json>] [--apply]
 *
 * Sin --apply es dry-run (no escribe). Idempotente: solo toca los campos
 * listados y solo si el valor actual coincide con «before», o si es relleno
 * (medidas ≤ 1 cm en las tres dimensiones). Si ya vale «after» lo saltea; si
 * vale otra cosa lo informa como conflicto y no lo pisa.
 *
 * Formato de cada cambio:
 *   { productId, name, brand, field, before, after, sourceUrl, quote }
 * field ∈ widthCm | heightCm | depthCm | cutoutDiameterCm | rackUnits
 * Si el productId no existe (otra base), busca por nombre + marca (único).
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/prisma";
import { mergeFieldTimestamps } from "../src/lib/field-timestamps";
import { isPlaceholderDimensions } from "../src/services/sync/dimensions";

const FIELDS = ["widthCm", "heightCm", "depthCm", "cutoutDiameterCm", "rackUnits"] as const;
type Field = (typeof FIELDS)[number];
const DIMENSION_FIELDS = new Set<Field>(["widthCm", "heightCm", "depthCm"]);
const DEFAULT_FILE = path.join(__dirname, "data", "product-dimensions-changes.json");
const EPSILON = 0.005;
const BATCH = 25;

type Change = {
  productId: string;
  name?: string;
  brand?: string | null;
  field: Field;
  before: number | null;
  after: number | null;
  sourceUrl: string;
  quote: string;
};

type Current = {
  id: string;
  fieldUpdatedAt: unknown;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  cutoutDiameterCm: number | null;
  rackUnits: number | null;
};

const SELECT = {
  id: true, fieldUpdatedAt: true, widthCm: true, heightCm: true, depthCm: true, cutoutDiameterCm: true, rackUnits: true,
} as const;

function parseArgs(argv: string[]) {
  const i = argv.indexOf("--file");
  return { file: i >= 0 && argv[i + 1] ? argv[i + 1] : DEFAULT_FILE, apply: argv.includes("--apply") };
}

function validate(raw: unknown): Change[] {
  if (!Array.isArray(raw)) throw new Error("El archivo debe ser un array de cambios");
  return raw.map((c, i) => {
    const ok =
      c && typeof c.productId === "string" && FIELDS.includes(c.field) &&
      (c.before === null || typeof c.before === "number") &&
      (c.after === null || (typeof c.after === "number" && c.after > 0 && c.after < 1000)) &&
      typeof c.sourceUrl === "string" && typeof c.quote === "string";
    if (!ok) throw new Error(`Cambio #${i} inválido: ${JSON.stringify(c).slice(0, 200)}`);
    if (c.field === "rackUnits" && c.after !== null && !Number.isInteger(c.after)) throw new Error(`Cambio #${i}: rackUnits debe ser entero`);
    return c as Change;
  });
}

const num = (v: unknown) => (v == null ? null : Number(v));
const same = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < EPSILON);

function toCurrent(p: Record<string, unknown>): Current {
  return {
    id: p.id as string,
    fieldUpdatedAt: p.fieldUpdatedAt,
    widthCm: num(p.widthCm), heightCm: num(p.heightCm), depthCm: num(p.depthCm),
    cutoutDiameterCm: num(p.cutoutDiameterCm), rackUnits: num(p.rackUnits),
  };
}

async function loadByIds(ids: string[]): Promise<Map<string, Current>> {
  const found = new Map<string, Current>();
  for (let i = 0; i < ids.length; i += 500) {
    const rows = await prisma.product.findMany({ where: { id: { in: ids.slice(i, i + 500) } }, select: SELECT });
    for (const row of rows) found.set(row.id, toCurrent(row));
  }
  return found;
}

async function findProduct(change: Change, preloaded: Map<string, Current>): Promise<Current | null> {
  const byId = preloaded.get(change.productId);
  if (byId) return byId;
  if (!change.name) return null;
  const matches = await prisma.product.findMany({
    where: { normalizedName: change.name, ...(change.brand ? { brand: { name: change.brand } } : {}) },
    select: SELECT,
    take: 2,
  });
  return matches.length === 1 ? toCurrent(matches[0]) : null;
}

type Decision = "aplicar" | "ya aplicado" | "conflicto";

function decide(change: Change, current: Current): Decision {
  const value = current[change.field];
  if (same(value, change.after)) return "ya aplicado";
  if (same(value, change.before)) return "aplicar";
  if (DIMENSION_FIELDS.has(change.field) && isPlaceholderDimensions(current) && (value === null || value <= 1)) return "aplicar";
  return "conflicto";
}

async function main() {
  const { file, apply } = parseArgs(process.argv.slice(2));
  const changes = validate(JSON.parse(readFileSync(file, "utf8")));
  console.log(`${apply ? "APLICANDO" : "DRY-RUN"} · ${changes.length} cambios de ${file}`);

  const byProduct = new Map<string, Change[]>();
  for (const c of changes) byProduct.set(c.productId, [...(byProduct.get(c.productId) ?? []), c]);

  const stats = { aplicar: 0, "ya aplicado": 0, conflicto: 0, "sin producto": 0 };
  const updates: Array<{ id: string; data: Prisma.ProductUncheckedUpdateInput }> = [];
  const now = new Date().toISOString();

  const preloaded = await loadByIds([...byProduct.keys()]);
  for (const [productId, list] of byProduct) {
    const current = await findProduct(list[0], preloaded);
    if (!current) {
      stats["sin producto"] += list.length;
      console.log(`  sin producto: ${productId} (${list[0].name ?? "?"})`);
      continue;
    }
    const data: Record<string, number | null> = {};
    for (const change of list) {
      const decision = decide(change, current);
      stats[decision] += 1;
      if (decision === "conflicto") {
        console.log(`  conflicto: ${change.name ?? productId} ${change.field} actual=${current[change.field]} esperado=${change.before} → ${change.after}`);
        continue;
      }
      if (decision === "aplicar") data[change.field] = change.after;
    }
    const fields = Object.keys(data);
    if (fields.length > 0) {
      updates.push({ id: current.id, data: { ...data, fieldUpdatedAt: mergeFieldTimestamps(current.fieldUpdatedAt, fields, now) } });
    }
  }

  console.log(`  a aplicar: ${stats.aplicar} · ya aplicados: ${stats["ya aplicado"]} · conflictos: ${stats.conflicto} · sin producto: ${stats["sin producto"]}`);
  console.log(`  productos a actualizar: ${updates.length}`);
  if (!apply) {
    console.log("Dry-run: no se escribió nada. Repetir con --apply.");
    return;
  }
  for (let i = 0; i < updates.length; i += BATCH) {
    const chunk = updates.slice(i, i + BATCH);
    await prisma.$transaction(chunk.map((u) => prisma.product.update({ where: { id: u.id }, data: u.data })));
  }
  console.log(`Listo: ${updates.length} productos actualizados.`);
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
