/**
 * Arma el archivo de cambios de medidas físicas a partir de las fichas
 * oficiales ya guardadas en Product.specifications (portal de Sonance para
 * Sonance/Blaze/IPORT/TRUFIG/James, crestron.com para Crestron).
 * No escribe en la base: genera el JSON que después aplica
 * scripts/apply-product-dimensions.ts.
 *
 *   npx tsx scripts/extract-product-dimensions.ts <salida.json> [extra.json]
 *
 * extra.json (opcional) = cambios cargados a mano desde fichas leídas en la
 * web (mismo formato); se suman al final y tienen prioridad.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { parseLengthCm } from "../src/services/crestron-web/normalize";
import { isPlaceholderDimensions } from "../src/services/sync/dimensions";

type Field = "widthCm" | "heightCm" | "depthCm" | "cutoutDiameterCm" | "rackUnits";
type Change = {
  productId: string;
  name: string;
  brand: string | null;
  field: Field;
  before: number | null;
  after: number | null;
  sourceUrl: string;
  quote: string;
};
type Spec = { label: string; value: string };
type Found = { value: number; quote: string };

const SONANCE_PORTAL = "https://my.sonance.com";
const round2 = (n: number) => Math.round(n * 100) / 100;

function specsOf(raw: unknown): Spec[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((s) => {
    const label = typeof s?.label === "string" ? s.label : typeof s?.name === "string" ? s.name : "";
    const value = typeof s?.value === "string" ? s.value : "";
    return label && value ? [{ label: label.trim(), value: value.trim() }] : [];
  });
}

const all = (specs: Spec[], label: string) => specs.filter((s) => s.label.toLowerCase() === label.toLowerCase());
/** Solo si la etiqueta aparece una vez (en kits Crestron se repite por componente). */
function one(specs: Spec[], label: string): Spec | undefined {
  const found = all(specs, label);
  return found.length === 1 ? found[0] : undefined;
}

/** Números en mm (o cm → mm) de un texto, en orden. */
function mmValues(value: string): number[] {
  const mm = [...value.matchAll(/(\d+(?:\.\d+)?)\s*mm\b/gi)].map((m) => Number(m[1]));
  if (mm.length > 0) return mm;
  return [...value.matchAll(/(\d+(?:\.\d+)?)\s*cm\b/gi)].map((m) => Number(m[1]) * 10);
}

function length(spec: Spec | undefined): Found | undefined {
  if (!spec) return undefined;
  const cm = parseLengthCm(spec.value.split(";")[0]);
  return cm && cm > 0 ? { value: round2(cm), quote: `${spec.label}: ${spec.value}` } : undefined;
}

function triple(spec: Spec | undefined): [Found, Found, Found] | undefined {
  if (!spec) return undefined;
  const mm = mmValues(spec.value);
  if (mm.length !== 3) return undefined;
  const quote = `${spec.label}: ${spec.value}`;
  return [mm[0], mm[1], mm[2]].map((v) => ({ value: round2(v / 10), quote })) as [Found, Found, Found];
}

/** Crestron «Height: 5.29 in. (134 mm) Width: … Depth: …». */
function labeledTriple(spec: Spec | undefined): Partial<Record<"w" | "h" | "d", Found>> {
  if (!spec) return {};
  const quote = `${spec.label}: ${spec.value}`;
  const pick = (re: RegExp) => {
    const m = spec.value.match(re);
    const cm = m ? parseLengthCm(m[1]) : undefined;
    return cm ? { value: round2(cm), quote } : undefined;
  };
  return {
    h: pick(/Height:\s*([\d.]+\s*in\.?\s*(?:\(\s*[\d.]+\s*mm\s*\))?)/i),
    w: pick(/Width:\s*([\d.]+\s*in\.?\s*(?:\(\s*[\d.]+\s*mm\s*\))?)/i),
    d: pick(/Depth:\s*([\d.]+\s*in\.?\s*(?:\(\s*[\d.]+\s*mm\s*\))?)/i),
  };
}

const TRIPLE_LABELS = [
  "Product Dimensions (WxHxD)",
  "Dimensions No Feet (WxHxD)",
  "Display Dimensions (W x H x D)",
  "Dimensions (W × H × D)",
  "Device Dimension (WxHxD)",
];
const FACE_LABELS = [
  "Product Dimensions - Trimless Grille (WxH)",
  "Product Dimensions - Square Trimless Grille (WxH)",
  "Product Dimensions - Micro Trim Grille (WxH)",
  "Product Dimensions - Square Micro Trim Grille (WxH)",
];

type Dims = { w?: Found; h?: Found; d?: Found };

function dimsFromSpecs(specs: Spec[], isCrestron: boolean): Dims {
  // 1) Ancho / alto / profundidad explícitos.
  const w = length(one(specs, "Product Width") ?? (isCrestron ? one(specs, "Width") : undefined));
  const h = length(one(specs, "Product Height") ?? one(specs, "Product Height (No Feet)") ?? (isCrestron ? one(specs, "Height") : undefined));
  const depthSpec = one(specs, "Product Depth") ?? (isCrestron ? one(specs, "Depth") : undefined);
  const d = length(depthSpec);
  if (w && h) return { w, h, d };

  // 2) Terna W×H×D.
  for (const label of TRIPLE_LABELS) {
    const t = triple(one(specs, label));
    if (t) return { w: t[0], h: t[1], d: t[2] };
  }
  if (isCrestron) {
    const dimSpec = one(specs, "Dimensions");
    const lt = labeledTriple(dimSpec);
    if (lt.w && lt.h) return lt;
    // «8.9 in. x 8.1 in. x 6.3 in. (226 mm × 206 mm × 160 mm)» → W×H×D
    const t = dimSpec && /\bx\b|×/i.test(dimSpec.value) && !/L\s*x\s*W/i.test(dimSpec.value) ? triple(dimSpec) : undefined;
    if (t) return { w: t[0], h: t[1], d: t[2] };
  }

  // 3) Redondos: diámetro × profundidad.
  const diamXD = one(specs, "Product Dimensions (Diameter x D)");
  const dxd = diamXD ? mmValues(diamXD.value) : [];
  const diameter =
    length(one(specs, "Product Diameter")) ??
    (dxd.length === 2 ? { value: round2(dxd[0] / 10), quote: `${diamXD!.label}: ${diamXD!.value}` } : undefined);
  const roundDepth = d ?? (dxd.length === 2 ? { value: round2(dxd[1] / 10), quote: `${diamXD!.label}: ${diamXD!.value}` } : undefined);
  const fallbackDepth = roundDepth ?? length(one(specs, "Mounting Depth - Speaker Only")) ?? length(one(specs, "Grille Depth"));
  if (diameter) return { w: diameter, h: diameter, d: fallbackDepth };

  // 4) Frente de la rejilla (W×H o diámetro) + profundidad.
  for (const label of FACE_LABELS) {
    const spec = one(specs, label);
    if (!spec) continue;
    const mm = mmValues(spec.value);
    const quote = `${spec.label}: ${spec.value}`;
    if (mm.length === 1) return { w: { value: round2(mm[0] / 10), quote }, h: { value: round2(mm[0] / 10), quote }, d: fallbackDepth };
    if (mm.length === 2) return { w: { value: round2(mm[0] / 10), quote }, h: { value: round2(mm[1] / 10), quote }, d: fallbackDepth };
  }
  const grilleDiam = length(one(specs, "Grille Diameter"));
  if (grilleDiam) return { w: grilleDiam, h: grilleDiam, d: fallbackDepth };
  const gw = length(one(specs, "Grille Width"));
  const gh = length(one(specs, "Grille Height"));
  if (gw && gh) return { w: gw, h: gh, d: fallbackDepth };

  return { w, h, d };
}

function cutoutFromSpecs(specs: Spec[]): Found | undefined {
  return length(one(specs, "Cut-Out Dimensions (Diameter)") ?? one(specs, "Recommended Cutout Diameter"));
}

function rackUnitsFromSpecs(specs: Spec[]): Found | undefined {
  for (const label of ["Rack Units", "Rack size"]) {
    const spec = one(specs, label);
    const m = spec?.value.match(/^\s*([1-9])\s*U\b/i);
    if (spec && m) return { value: Number(m[1]), quote: `${spec.label}: ${spec.value}` };
  }
  const mounting = one(specs, "Mounting");
  const m = mounting?.value.match(/\b([1-9])\s*RU\b/);
  if (mounting && m) return { value: Number(m[1]), quote: `${mounting.label}: ${mounting.value}` };
  return undefined;
}

const num = (v: unknown) => (v == null ? null : Number(v));

/** Fichas con medidas copiadas de otro modelo (HT-HVMT32 trae las del de 24"). */
const SKIP_DIMENSIONS = new Set(["HT-HVMT32"]);

async function main() {
  const [out, extra] = process.argv.slice(2);
  if (!out) throw new Error("Falta la ruta de salida");
  const products = await prisma.product.findMany({
    where: { isActive: true },
    select: {
      id: true, normalizedName: true, vendorProductUrl: true, specifications: true,
      widthCm: true, heightCm: true, depthCm: true, cutoutDiameterCm: true, rackUnits: true,
      brand: { select: { name: true } },
    },
    orderBy: { normalizedName: "asc" },
  });

  const changes: Change[] = [];
  for (const p of products) {
    const brand = p.brand?.name ?? null;
    const isCrestron = /crestron/i.test(brand ?? "");
    const url = p.vendorProductUrl?.startsWith("/") ? `${SONANCE_PORTAL}${p.vendorProductUrl}` : p.vendorProductUrl ?? "";
    const specs = specsOf(p.specifications);
    const current = { widthCm: num(p.widthCm), heightCm: num(p.heightCm), depthCm: num(p.depthCm) };
    const placeholder = isPlaceholderDimensions(current);
    const push = (field: Field, before: number | null, found: Found | undefined, fallbackQuote?: string) => {
      const after = found ? found.value : null;
      if (before === after) return;
      if (!found && !fallbackQuote) return;
      changes.push({ productId: p.id, name: p.normalizedName, brand, field, before, after, sourceUrl: url, quote: found?.quote ?? fallbackQuote! });
    };

    const dims = specs.length > 0 && !SKIP_DIMENSIONS.has(p.normalizedName) ? dimsFromSpecs(specs, isCrestron) : {};
    const empty = current.widthCm == null && current.heightCm == null && current.depthCm == null;
    if (placeholder) {
      // Relleno: se reemplaza por la ficha o pasa a null («sin dato» > dato falso).
      const why = "Relleno 1×1×1 del portal (shippingWidth/Height/Length = 1.000): sin dato real";
      push("widthCm", current.widthCm, dims.w, why);
      push("heightCm", current.heightCm, dims.h, why);
      push("depthCm", current.depthCm, dims.d, why);
    } else if (empty) {
      push("widthCm", null, dims.w);
      push("heightCm", null, dims.h);
      push("depthCm", null, dims.d);
    } else if (isCrestron) {
      // Error de unidad de crestron.com: «1.72 in (44 cm)».
      for (const [field, label] of [["heightCm", "Height"], ["widthCm", "Width"], ["depthCm", "Depth"]] as const) {
        const spec = one(specs, label);
        const found = length(spec);
        const before = current[field];
        if (!spec || !found || before == null) continue;
        if (/\d\s*cm\b/i.test(spec.value) && Math.abs(before - found.value) / found.value > 0.2) push(field, before, found);
      }
    }

    if (p.cutoutDiameterCm == null) push("cutoutDiameterCm", null, cutoutFromSpecs(specs));
    if (p.rackUnits == null) push("rackUnits", null, rackUnitsFromSpecs(specs));
  }

  if (extra) {
    const manual = JSON.parse(readFileSync(extra, "utf8")) as Change[];
    for (const m of manual) {
      const i = changes.findIndex((c) => c.productId === m.productId && c.field === m.field);
      if (i >= 0) changes.splice(i, 1, m);
      else changes.push(m);
    }
  }

  writeFileSync(out, JSON.stringify(changes, null, 2));
  const by = new Map<string, number>();
  for (const c of changes) {
    const k = `${c.brand} · ${c.field} · ${c.after == null ? "→ null" : "→ valor"}`;
    by.set(k, (by.get(k) ?? 0) + 1);
  }
  console.log(`${changes.length} cambios → ${out}`);
  console.log([...by].sort().map(([k, v]) => `${v}\t${k}`).join("\n"));
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
