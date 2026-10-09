/**
 * Carga por lotes de los puertos reales del catálogo. Idempotente: si la
 * ficha de un producto no cambió (mismo hash) no se vuelve a leer. Corre en
 * tandas cortas desde el admin (límite de tiempo de la función).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IO_EXTRACTOR_VERSION, extractIo } from "./extract";
import { buildIoSource, type IoSourceRow } from "./source";

/** Equipos que tienen conexiones de señal (los soportes, cables y accesorios no). */
const RELEVANT_TYPES = ["speaker", "subwoofer", "amplifier", "processor", "control", "touchpanel", "display", "switcher", "camera", "microphone", "network"];
const RELEVANT_ROLES = ["camera", "mic", "display", "speaker", "touch", "codec", "processor"];
/** Confianza mínima para dar el perfil por bueno sin revisión. */
const AUTO_CONFIDENCE = 0.9;
const PARALLEL = 4;
const MAX_LIMIT = 40;

const SELECT = {
  id: true,
  normalizedName: true,
  modelNumber: true,
  shortDescription: true,
  longDescription: true,
  htmlContent: true,
  keyFeatures: true,
  specifications: true,
  documents: true,
  vendorProductUrl: true,
  brand: { select: { name: true } },
  ioProfile: { select: { sourceHash: true, extractorVersion: true } },
} satisfies Prisma.ProductSelect;

function relevantWhere(): Prisma.ProductWhereInput {
  return {
    isActive: true,
    OR: [{ aiProfile: { is: { productType: { in: RELEVANT_TYPES } } } }, { designProfile: { is: { designRole: { in: RELEVANT_ROLES } } } }],
  };
}

function pendingWhere(): Prisma.ProductWhereInput {
  return { AND: [relevantWhere(), { OR: [{ ioProfile: { is: null } }, { ioProfile: { is: { extractorVersion: { lt: IO_EXTRACTOR_VERSION } } } }] }] };
}

export async function ioProfileStats() {
  const [relevant, pending, byStatus] = await Promise.all([
    prisma.product.count({ where: relevantWhere() }),
    prisma.product.count({ where: pendingWhere() }),
    prisma.productIoProfile.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const count = (s: string) => byStatus.find((b) => b.status === s)?._count._all ?? 0;
  return { relevant, pending, auto: count("auto"), needsReview: count("needs_review"), approved: count("approved"), notApplicable: count("not_applicable") };
}

export type IoBuildStats = { scanned: number; built: number; skipped: number; failed: number; enriched: number; inputTokens: number; outputTokens: number; errors: string[] };

type Row = IoSourceRow & { ioProfile: { sourceHash: string; extractorVersion: number } | null; documents: unknown };

/** Agrega al producto las fichas oficiales encontradas en la web (sin duplicar). */
async function saveDiscovered(row: Row, docs: Array<{ url: string; title: string; isPdf: boolean; secondary?: boolean }>) {
  if (!docs.length) return 0;
  const current = Array.isArray(row.documents) ? (row.documents as Array<Record<string, unknown>>) : [];
  // Solo las fichas oficiales quedan en el producto; las fuentes secundarias quedan citadas en el perfil.
  const fresh = docs.filter((d) => !d.secondary && !current.some((c) => c.url === d.url));
  if (!fresh.length) return 0;
  const next = [...current, ...fresh.map((d) => ({ name: d.title.slice(0, 120), nameEs: "Ficha técnica oficial", url: d.url, type: "datasheet", fileType: d.isPdf ? "pdf" : "html", source: "web-enrichment" }))];
  await prisma.product.update({ where: { id: row.id }, data: { documents: next as Prisma.InputJsonValue } });
  return fresh.length;
}

async function processRow(row: Row, force: boolean, stats: IoBuildStats) {
  let source = await buildIoSource(row);
  stats.enriched += await saveDiscovered(row, source.discovered);
  if (!force && row.ioProfile && row.ioProfile.sourceHash === source.hash && row.ioProfile.extractorVersion >= IO_EXTRACTOR_VERSION) {
    stats.skipped++;
    return;
  }
  const base = { source: source.kind, sourceUrls: source.urls, sourceHash: source.hash, extractorVersion: IO_EXTRACTOR_VERSION, builtAt: new Date() };
  if (!source.text.trim()) {
    const data = { ...base, ports: [], capabilities: {}, status: "needs_review", confidence: 0, notes: "Sin ficha: no se encontró información técnica del producto (ni en el catálogo ni en el sitio del fabricante).", model: null };
    await prisma.productIoProfile.upsert({ where: { productId: row.id }, create: { productId: row.id, ...data }, update: data });
    stats.built++;
    return;
  }
  const read = () => extractIo({ brand: row.brand?.name ?? null, name: row.normalizedName, model: row.modelNumber, sourceText: source.text });
  let { result, model, inputTokens, outputTokens } = await read();
  stats.inputTokens += inputTokens;
  stats.outputTokens += outputTokens;
  // Lectura dudosa o sin puertos: se vuelve a leer sumando la ficha oficial del sitio del fabricante.
  if (result.applies && (result.confidence < AUTO_CONFIDENCE || !result.data.ports.length) && source.discovered.length === 0) {
    const richer = await buildIoSource(row, true, true);
    if (richer.discovered.length) {
      source = richer;
      stats.enriched += await saveDiscovered(row, richer.discovered);
      ({ result, model, inputTokens, outputTokens } = await read());
      stats.inputTokens += inputTokens;
      stats.outputTokens += outputTokens;
    }
  }
  const status = !result.applies ? "not_applicable" : result.data.ports.length && result.confidence >= AUTO_CONFIDENCE ? "auto" : "needs_review";
  const data = {
    ...base,
    ports: result.data.ports as unknown as Prisma.InputJsonValue,
    capabilities: result.data.capabilities as unknown as Prisma.InputJsonValue,
    rejected: result.rejected.length ? (result.rejected as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    status,
    confidence: result.confidence,
    notes: result.notes,
    model,
  };
  await prisma.productIoProfile.upsert({ where: { productId: row.id }, create: { productId: row.id, ...data }, update: data });
  stats.built++;
}

export async function buildIoProfiles(options: { limit?: number; force?: boolean; productIds?: string[]; deadlineMs?: number } = {}): Promise<IoBuildStats & { pending: number }> {
  const limit = Math.min(MAX_LIMIT, Math.max(1, options.limit ?? 12));
  const startedAt = Date.now();
  const deadline = options.deadlineMs ?? 230_000;
  const stats: IoBuildStats = { scanned: 0, built: 0, skipped: 0, failed: 0, enriched: 0, inputTokens: 0, outputTokens: 0, errors: [] };

  let rows: Row[];
  if (options.productIds?.length) {
    rows = (await prisma.product.findMany({ where: { id: { in: options.productIds } }, select: SELECT })) as unknown as Row[];
  } else {
    // Primero lo que ya se usa en proyectos del Room Builder; después el resto.
    const used = await prisma.roomProjectDevice.findMany({ where: { productId: { not: null }, product: pendingWhere() }, select: { productId: true }, distinct: ["productId"], take: limit });
    const usedIds = used.map((u) => u.productId).filter((id): id is string => Boolean(id));
    const rest = usedIds.length < limit ? await prisma.product.findMany({ where: { AND: [pendingWhere(), { id: { notIn: usedIds } }] }, select: { id: true }, orderBy: { updatedAt: "desc" }, take: limit - usedIds.length }) : [];
    const ids = [...usedIds, ...rest.map((r) => r.id)];
    rows = (await prisma.product.findMany({ where: { id: { in: ids } }, select: SELECT })) as unknown as Row[];
  }

  for (let i = 0; i < rows.length; i += PARALLEL) {
    if (Date.now() - startedAt > deadline) break;
    await Promise.all(
      rows.slice(i, i + PARALLEL).map(async (row) => {
        stats.scanned++;
        try {
          await processRow(row, Boolean(options.force), stats);
        } catch (error) {
          stats.failed++;
          stats.errors.push(`${row.normalizedName}: ${error instanceof Error ? error.message : String(error)}`.slice(0, 200));
        }
      }),
    );
  }
  const pending = await prisma.product.count({ where: pendingWhere() });
  return { ...stats, pending };
}
