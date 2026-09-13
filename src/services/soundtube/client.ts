/**
 * Cliente del catálogo público de soundtube.com (NetSuite SuiteCommerce).
 *
 * No requiere login: la API de items devuelve stock, niveles de precio,
 * imágenes, descripción HTML y atributos (custitem_*). El login del portal
 * tiene reCAPTCHA, así que no se automatiza.
 *
 *   GET /api/items?c=4792156&n=2&country=US&currency=USD&language=en
 *       &fieldset=search|details&limit=100&offset=0[&id=123]
 */

export const SOUNDTUBE_BASE_URL = "https://www.soundtube.com";
const COMPANY_ID = "4792156";
const SITE_ID = "2";
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const TIMEOUT_MS = 30_000;
const MAX_ATTEMPTS = 3;
export const SOUNDTUBE_PAGE_LIMIT = 100;

export interface SoundTubeImage {
  url: string;
  altimagetext?: string;
}

/** Campos que expone la API (unión de los fieldsets `search` y `details`). */
export interface SoundTubeItem {
  internalid: number;
  itemid: string;
  displayname: string;
  storedisplayname2?: string;
  urlcomponent?: string;
  itemtype?: string;
  manufacturer?: string;
  upccode?: string;
  storedescription?: string;
  storedetaileddescription?: string;
  featureddescription?: string;
  pagetitle?: string;
  metataghtml?: string;
  relateditemsdescription?: string;
  itemimages_detail?: { urls?: SoundTubeImage[] };
  commercecategory?: { primarypath?: unknown[]; categories?: Array<{ name: string; id: number; urls?: string[] }> };
  custitemmanufacturer_category?: string;
  custitem_color?: string;
  custitem_enclosure_prop?: string;
  custitem_grille_properties?: string;
  custitem_input_power?: string;
  custitem_input_type?: string;
  custitem_ip_rating?: string;
  custitem_taa_compliant?: string;
  custitem_baa_compliant?: string;
  custitem_en54?: string;
  custitem_weight_kg?: string;
  custitem_ag_specifications?: string;
  custitem_ag_related_documents?: string;
  weight?: number;
  weightunit?: string;
  quantityavailable?: number;
  isinstock?: boolean;
  isbackorderable?: boolean;
  ispurchasable?: boolean;
  outofstockmessage?: string;
  stockdescription?: string;
  onlinecustomerprice?: number;
  pricelevel1?: number;
  pricelevel30?: number;
  [key: string]: unknown;
}

interface ItemsResponse {
  total?: number;
  items?: SoundTubeItem[];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getJson<T>(url: string): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} en ${url}`);
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt < MAX_ATTEMPTS) await sleep(800 * attempt);
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`No se pudo obtener ${url}`);
}

function itemsUrl(params: Record<string, string | number>): string {
  const search = new URLSearchParams({
    c: COMPANY_ID,
    n: SITE_ID,
    country: "US",
    currency: "USD",
    language: "en",
  });
  for (const [key, value] of Object.entries(params)) search.set(key, String(value));
  return `${SOUNDTUBE_BASE_URL}/api/items?${search.toString()}`;
}

/** Cantidad total de items publicados. */
export async function fetchSoundTubeTotal(): Promise<number> {
  const data = await getJson<ItemsResponse>(itemsUrl({ fieldset: "search", limit: 1, offset: 0 }));
  return data.total ?? 0;
}

/**
 * Página de items con los dos fieldsets mezclados (search trae precios, stock,
 * marca y categoría del fabricante; details trae descripción, documentos,
 * atributos y peso).
 */
export async function fetchSoundTubePage(
  offset: number,
  limit: number
): Promise<{ items: SoundTubeItem[]; total: number }> {
  const size = Math.max(1, Math.min(SOUNDTUBE_PAGE_LIMIT, limit));
  const [search, details] = await Promise.all([
    getJson<ItemsResponse>(itemsUrl({ fieldset: "search", limit: size, offset })),
    getJson<ItemsResponse>(itemsUrl({ fieldset: "details", limit: size, offset })),
  ]);
  const detailsById = new Map((details.items ?? []).map((item) => [item.internalid, item]));
  const items = (search.items ?? []).map((item) => ({
    ...(detailsById.get(item.internalid) ?? {}),
    ...item,
  }));
  return { items, total: search.total ?? items.length };
}

/** URL pública de la ficha. */
export function soundTubeProductUrl(item: SoundTubeItem): string | undefined {
  return item.urlcomponent ? `${SOUNDTUBE_BASE_URL}/${item.urlcomponent}` : undefined;
}

/** Los documentos de `custitem_ag_related_documents` viven en /Downloads/{archivo}. */
export function soundTubeDocumentUrl(fileName: string): string {
  return `${SOUNDTUBE_BASE_URL}/Downloads/${encodeURIComponent(fileName.trim())}`;
}
