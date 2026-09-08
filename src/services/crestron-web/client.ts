/**
 * Cliente HTTP para el sitio público crestron.com.
 *
 * Endpoints (descubiertos inspeccionando el sitio, sin autenticación):
 *  - GET /model/{materialNumber}              → 301 a la ficha del producto
 *  - GET /handlers/search_v2.ashx?q=&quicksearch=true → JSON con url/thumbnail/discontinued
 *  - GET /Handlers/ResourceHandler.ashx?dID=  → HTML de "Downloads & documentation"
 *  - GET /Handlers/VariantProduct.ashx?...    → HTML "Available Models" + "In the box"
 *  - GET /Handlers/OptionalAccessoriesHandler.ashx?ids=&culture= → HTML accesorios
 *  - GET /Handlers/RelatedProducts.ashx?...   → HTML slider de relacionados
 *  - GET /Handlers/ReplacementProductsHandler.ashx?ids=&label=&culture= → HTML reemplazos
 */

import type { CrestronSearchHit } from "./types";

export const CRESTRON_BASE_URL = "https://www.crestron.com";
const CULTURE = "en-US";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36 SoundtecCatalogBot/1.0";
const DEFAULT_TIMEOUT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const RETRY_BASE_DELAY_MS = 600;

export class CrestronHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly url: string
  ) {
    super(message);
    this.name = "CrestronHttpError";
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function absoluteUrl(href: string | undefined | null): string | undefined {
  const value = (href ?? "").trim();
  if (!value) return undefined;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith("//")) return `https:${value}`;
  if (value.startsWith("/")) return `${CRESTRON_BASE_URL}${value}`;
  return `${CRESTRON_BASE_URL}/${value}`;
}

async function request(
  url: string,
  init: { redirect?: RequestRedirect; accept?: string } = {}
): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        method: "GET",
        redirect: init.redirect ?? "follow",
        signal: controller.signal,
        cache: "no-store",
        headers: {
          "User-Agent": USER_AGENT,
          Accept: init.accept ?? "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
      });
      if (response.status >= 500 || response.status === 429) {
        throw new CrestronHttpError(
          `HTTP ${response.status} en ${url}`,
          response.status,
          url
        );
      }
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(RETRY_BASE_DELAY_MS * attempt);
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  if (lastError instanceof Error) throw lastError;
  throw new Error(`No se pudo obtener ${url}`);
}

export async function fetchText(url: string): Promise<string> {
  const response = await request(url);
  if (!response.ok) {
    throw new CrestronHttpError(`HTTP ${response.status} en ${url}`, response.status, url);
  }
  return response.text();
}

/**
 * Resuelve la URL de la ficha a partir del material number usando el redirect
 * oficial `/model/{materialNumber}`. Devuelve null si Crestron no lo conoce.
 */
export async function resolveProductUrlByMaterialNumber(
  materialNumber: string
): Promise<string | null> {
  const clean = materialNumber.trim();
  if (!/^\d{4,}$/.test(clean)) return null;
  const url = `${CRESTRON_BASE_URL}/model/${encodeURIComponent(clean)}`;
  const response = await request(url, { redirect: "manual" });
  const location = response.headers.get("location");
  if (response.status >= 300 && response.status < 400 && location) {
    const target = absoluteUrl(location);
    if (target && /\/Products\/Catalog\//i.test(target)) return target;
    return null;
  }
  if (response.status === 200) {
    // Algunos entornos siguen el redirect igual: usamos la URL final.
    const finalUrl = response.url;
    if (finalUrl && /\/Products\/Catalog\//i.test(finalUrl)) return finalUrl;
  }
  return null;
}

function stripHighlight(value: unknown): string {
  return String(value ?? "")
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

interface SearchResponse {
  results?: {
    topresults?: { items?: unknown[] };
    products?: { items?: unknown[] };
  };
}

function toSearchHit(item: unknown): CrestronSearchHit | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  const url = absoluteUrl(typeof record.url === "string" ? record.url : undefined);
  if (!url) return null;
  return {
    title: stripHighlight(record.title),
    url,
    thumbnail: typeof record.thumbnail === "string" ? record.thumbnail : undefined,
    description: stripHighlight(record.description) || undefined,
    discontinued: record.discontinuedproduct === true,
    datePublished:
      typeof record.datepublished === "string" ? record.datepublished : undefined,
  };
}

/** Búsqueda pública: devuelve los productos que matchean el texto. */
export async function searchProducts(query: string): Promise<CrestronSearchHit[]> {
  const clean = query.trim();
  if (!clean) return [];
  const url =
    `${CRESTRON_BASE_URL}/handlers/search_v2.ashx?q=${encodeURIComponent(clean)}` +
    `&quicksearch=true`;
  const response = await request(url, { accept: "application/json,text/plain,*/*" });
  if (!response.ok) return [];
  let parsed: SearchResponse;
  try {
    parsed = (await response.json()) as SearchResponse;
  } catch {
    return [];
  }
  const items = [
    ...(parsed.results?.topresults?.items ?? []),
    ...(parsed.results?.products?.items ?? []),
  ];
  const hits: CrestronSearchHit[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const hit = toSearchHit(item);
    if (!hit || seen.has(hit.url)) continue;
    seen.add(hit.url);
    hits.push(hit);
  }
  return hits;
}

function normalizeModelKey(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9+]/g, "");
}

/** Busca la ficha cuyo título coincide exactamente con el modelo. */
export async function findProductByModel(model: string): Promise<CrestronSearchHit | null> {
  const hits = await searchProducts(model);
  const wanted = normalizeModelKey(model);
  const exact = hits.find((hit) => normalizeModelKey(hit.title) === wanted);
  if (exact) return exact;
  const bySlug = hits.find(
    (hit) => normalizeModelKey(hit.url.split("/").pop() ?? "") === wanted
  );
  return bySlug ?? null;
}

export async function fetchResourcesHtml(documentId: string): Promise<string> {
  return fetchText(
    `${CRESTRON_BASE_URL}/Handlers/ResourceHandler.ashx?dID=${encodeURIComponent(documentId)}`
  );
}

function buildQuery(params: Record<string, string>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) search.set(key, value);
  return search.toString();
}

export async function fetchVariantsHtml(params: Record<string, string>): Promise<string> {
  return fetchText(`${CRESTRON_BASE_URL}/Handlers/VariantProduct.ashx?${buildQuery(params)}`);
}

export async function fetchOptionalAccessoriesHtml(ids: string): Promise<string> {
  return fetchText(
    `${CRESTRON_BASE_URL}/Handlers/OptionalAccessoriesHandler.ashx?ids=${encodeURIComponent(ids)}&culture=${CULTURE}`
  );
}

export async function fetchRelatedHtml(params: Record<string, string>): Promise<string> {
  return fetchText(`${CRESTRON_BASE_URL}/Handlers/RelatedProducts.ashx?${buildQuery(params)}`);
}

export async function fetchReplacementsHtml(ids: string, label: string): Promise<string> {
  return fetchText(
    `${CRESTRON_BASE_URL}/Handlers/ReplacementProductsHandler.ashx?ids=${encodeURIComponent(ids)}&label=${encodeURIComponent(label)}&culture=${CULTURE}`
  );
}
