/**
 * Lectura de fichas hecha fuera del sistema (un integrador o Claude leyendo
 * la ficha): el sistema arma el texto fuente de cada producto, la lectura se
 * hace afuera y vuelve acá, donde pasa por la misma validación que la lectura
 * automática (vocabulario cerrado y cita textual verificada en la ficha).
 */

import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { IO_EXTRACTOR_VERSION, validateExtraction, type RawExtraction } from "./extract";
import { buildIoSource, pageText, type IoSourceRow } from "./source";

const AUTO_CONFIDENCE = 0.9;
export const MANUAL_MODEL_PREFIX = "manual:";

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
  aiProfile: { select: { productType: true } },
  ioProfile: { select: { status: true, notes: true } },
} satisfies Prisma.ProductSelect;

export type ManualQueueItem = {
  id: string;
  brand: string | null;
  name: string;
  model: string | null;
  productType: string | null;
  status: string | null;
  notes: string | null;
  kind: string;
  urls: string[];
  sourceText: string;
};

/** Productos de esos estados que todavía no leyó nadie de afuera, con su texto fuente. */
export async function manualQueue(options: { statuses: string[]; limit: number; afterId?: string; withNetwork: boolean; productIds?: string[] }): Promise<{ items: ManualQueueItem[]; remaining: number }> {
  const where: Prisma.ProductWhereInput = options.productIds?.length
    ? { id: { in: options.productIds } }
    : {
        isActive: true,
        ioProfile: { is: { status: { in: options.statuses }, OR: [{ model: null }, { NOT: { model: { startsWith: MANUAL_MODEL_PREFIX } } }] } },
        ...(options.afterId ? { id: { gt: options.afterId } } : {}),
      };
  const [rows, remaining] = await Promise.all([
    prisma.product.findMany({ where, select: SELECT, orderBy: { id: "asc" }, take: options.limit }),
    prisma.product.count({ where }),
  ]);
  const items = await Promise.all(
    rows.map(async (row) => {
      const source = await buildIoSource(row as unknown as IoSourceRow, options.withNetwork).catch(() => null);
      return {
        id: row.id,
        brand: row.brand?.name ?? null,
        name: row.normalizedName,
        model: row.modelNumber,
        productType: row.aiProfile?.productType ?? null,
        status: row.ioProfile?.status ?? null,
        notes: row.ioProfile?.notes ?? null,
        kind: source?.kind ?? "none",
        urls: source?.urls ?? [],
        sourceText: source?.text ?? "",
      };
    }),
  );
  return { items, remaining };
}

export type ManualReading = {
  productId: string;
  /** Texto de la ficha leída (el que mandó la cola o el que se encontró en la web). */
  sourceText: string;
  sourceUrls: string[];
  source: "datasheet" | "specs" | "page" | "secondary";
  extraction: RawExtraction;
  /** Quién leyó: "claude", "integrador"… */
  reader: string;
  /**
   * Fichas encontradas en la web: el servidor las baja él mismo y suma su texto
   * a la fuente, así las citas se validan contra la ficha real y no contra un
   * texto pegado.
   */
  fetchUrls?: string[];
};

const MAX_FETCH = 3;
const MAX_FETCHED_CHARS = 60_000;

async function fetchedText(urls: string[]): Promise<{ text: string; urls: string[] }> {
  const parts: string[] = [];
  const ok: string[] = [];
  for (const url of urls.slice(0, MAX_FETCH)) {
    try {
      const t = await pageText(url);
      if (t.length < 200) continue;
      parts.push(`FICHA OFICIAL (${new URL(url).hostname}):\n${t.slice(0, MAX_FETCHED_CHARS)}`);
      ok.push(url);
    } catch (error) {
      console.warn("[io-profile/manual] no se pudo bajar", url, error instanceof Error ? error.message : error);
    }
  }
  return { text: parts.join("\n\n"), urls: ok };
}

/** Guarda una lectura externa con la misma validación que la automática. */
export async function saveManualReading(r: ManualReading) {
  const fetched = r.fetchUrls?.length ? await fetchedText(r.fetchUrls) : { text: "", urls: [] };
  if (fetched.text) r = { ...r, sourceText: `${r.sourceText}\n\n${fetched.text}`, sourceUrls: [...r.sourceUrls, ...fetched.urls], source: r.source === "specs" || r.source === "page" ? "datasheet" : r.source };
  const result = validateExtraction(r.extraction, r.sourceText);
  const status = !result.applies ? "not_applicable" : result.data.ports.length && result.confidence >= AUTO_CONFIDENCE ? "auto" : "needs_review";
  const data = {
    source: r.source,
    sourceUrls: r.sourceUrls.slice(0, 8),
    sourceHash: createHash("sha256").update(r.sourceText).digest("hex"),
    extractorVersion: IO_EXTRACTOR_VERSION,
    builtAt: new Date(),
    ports: result.data.ports as unknown as Prisma.InputJsonValue,
    capabilities: result.data.capabilities as unknown as Prisma.InputJsonValue,
    rejected: result.rejected.length ? (result.rejected as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
    status,
    confidence: result.confidence,
    notes: result.notes,
    model: `${MANUAL_MODEL_PREFIX}${r.reader}`.slice(0, 60),
  };
  await prisma.productIoProfile.upsert({ where: { productId: r.productId }, create: { productId: r.productId, ...data }, update: data });
  return { productId: r.productId, status, ports: result.data.ports.length, confidence: result.confidence, rejected: result.rejected };
}
