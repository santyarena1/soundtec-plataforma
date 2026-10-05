/**
 * Catálogo oficial de hallresearch.com (Atlona, Javelin, Hall Tech, Gain Audio, Captivate).
 * Un solo GET devuelve todos los productos (~300, ~1 MB): se baja una vez por corrida.
 */

import type { HallResearchCatalogResponse, HallResearchProduct, RichText } from "./types";

export const HALL_RESEARCH_PRODUCTS_URL = "https://hallresearch.com/api/products";
export const HALL_RESEARCH_PRODUCT_PAGE = "https://hallresearch.com/product/";

const FETCH_TIMEOUT_MS = 20_000;
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36";

/** "  at-ome-ms42 " → "AT-OME-MS42" */
export function normalizeSku(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function plainHeader(rt: RichText): string {
  return (rt ?? [])
    .map((block) => block.text ?? "")
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SKUs declarados en sub_header. Formatos vistos:
 *   "AT-OME-MS42"
 *   "JAV-CNTL-H1611 (formerly AT-DISP-CTRL)"
 *   "AT-AVA-F1311 (aka HT-AIM-70)"
 * Devuelve el SKU principal y los alias (formerly / aka).
 */
export function parseSubHeaderSkus(rt: RichText): { primary?: string; aliases: string[] } {
  const text = plainHeader(rt);
  if (!text) return { aliases: [] };
  const primary = normalizeSku(text.split("(")[0]) || undefined;
  const aliases: string[] = [];
  for (const match of Array.from(text.matchAll(/\((?:formerly|aka|previously)\s+([^)]+)\)/gi))) {
    for (const part of match[1].split(/[,/]| or /i)) {
      const alias = normalizeSku(part);
      if (alias) aliases.push(alias);
    }
  }
  return { primary, aliases };
}

/**
 * Índice SKU normalizado → producto. Prioridad ante colisiones:
 * SKU de sub_header > uid > alias (formerly/aka). Dentro del mismo nivel gana el primero.
 */
export function indexCatalog(results: HallResearchProduct[]): Map<string, HallResearchProduct> {
  const index = new Map<string, HallResearchProduct>();
  const levels: Array<(item: HallResearchProduct) => string[]> = [
    (item) => {
      const { primary } = parseSubHeaderSkus(item.data?.sub_header);
      return primary ? [primary] : [];
    },
    (item) => (item.uid ? [normalizeSku(item.uid)] : []),
    (item) => parseSubHeaderSkus(item.data?.sub_header).aliases,
  ];
  for (const keysOf of levels) {
    for (const item of results) {
      for (const key of keysOf(item)) {
        if (key && !index.has(key)) index.set(key, item);
      }
    }
  }
  return index;
}

function isCatalogResponse(value: unknown): value is HallResearchCatalogResponse {
  if (!value || typeof value !== "object") return false;
  const results = (value as { results?: unknown }).results;
  return Array.isArray(results);
}

export async function fetchHallResearchCatalog(): Promise<HallResearchProduct[]> {
  let response: Response;
  try {
    response = await fetch(HALL_RESEARCH_PRODUCTS_URL, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`No se pudo descargar el catálogo de hallresearch.com: ${reason}`);
  }
  if (!response.ok) {
    throw new Error(`hallresearch.com respondió HTTP ${response.status} al pedir ${HALL_RESEARCH_PRODUCTS_URL}`);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!isCatalogResponse(body)) {
    throw new Error("hallresearch.com devolvió un JSON inesperado (falta results[])");
  }
  return body.results.filter(
    (item): item is HallResearchProduct =>
      !!item && typeof item.uid === "string" && !!item.data && typeof item.data === "object"
  );
}
