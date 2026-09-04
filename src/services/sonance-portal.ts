import https from "node:https";
import { getSetting } from "@/lib/settings";
import type { SonanceBrand, SonanceProduct } from "./sonance-import";

const BASE = "https://my.sonance.com";
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function browserHeaders(
  extra: Record<string, string> = {}
): Record<string, string> {
  return {
    "User-Agent": UA,
    "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
    "Accept-Encoding": "identity",
    "sec-ch-ua": '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    Connection: "keep-alive",
    ...extra,
  };
}

interface RawResponse {
  status: number;
  headers: NodeJS.Dict<string | string[]>;
  body: string;
}

function rawRequestOnce(
  url: string,
  method: string,
  reqHeaders: Record<string, string>,
  body?: string,
  timeoutMs = 25000
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: reqHeaders,
        timeout: timeoutMs,
      },
      (res) => {
        let data = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (data += c));
        res.on("end", () =>
          resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data })
        );
      }
    );
    req.on("timeout", () => {
      req.destroy();
      reject(new Error(`Timeout (${timeoutMs}ms) en ${method} ${url}`));
    });
    req.setTimeout(timeoutMs);
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function rawSetCookies(headers: NodeJS.Dict<string | string[]>): string[] {
  const v = headers["set-cookie"];
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseCookiesRaw(setCookieHeaders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

function cookieStr(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ── login ─────────────────────────────────────────────────────────────────────

export interface Session {
  cookies: Record<string, string>;
}

export function sessionFromCookies(cookies: Record<string, string>): Session {
  return { cookies: { ...cookies } };
}

async function login(): Promise<Session> {
  const username = await getSetting("sonance.portal_username", "");
  const password = await getSetting("sonance.portal_password", "");
  if (!username || !password) {
    throw new Error("Credenciales de my.sonance.com no configuradas en el sistema.");
  }

  const body = JSON.stringify({ userName: username, password });
  async function attemptLogin(): Promise<{
    cookies: Record<string, string>;
    response: RawResponse;
  }> {
    const initRes = await rawRequestOnce(
      `${BASE}/SignIn`,
      "GET",
      browserHeaders({
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
      })
    );
    let attemptCookies = parseCookiesRaw(rawSetCookies(initRes.headers));
    const response = await rawRequestOnce(
      `${BASE}/api/v1/sessions`,
      "POST",
      browserHeaders({
        Accept: "application/json",
        "Content-Type": "application/json",
        "Content-Length": String(Buffer.byteLength(body)),
        Origin: BASE,
        Referer: `${BASE}/SignIn`,
        "X-Requested-With": "XMLHttpRequest",
        Cookie: cookieStr(attemptCookies),
      }),
      body
    );
    attemptCookies = {
      ...attemptCookies,
      ...parseCookiesRaw(rawSetCookies(response.headers)),
    };
    return { cookies: attemptCookies, response };
  }

  let attempt = await attemptLogin();
  if (attempt.response.status === 503 || attempt.response.status === 429) {
    await new Promise<void>((resolve) => setTimeout(resolve, 1500));
    attempt = await attemptLogin();
  }
  const { cookies, response: sessRes } = attempt;

  if (sessRes.status !== 200 && sessRes.status !== 201) {
    const snippet = sessRes.body.slice(0, 200).replace(/\s+/g, " ");
    throw new Error(
      `Login a my.sonance.com falló (HTTP ${sessRes.status}). ` +
      "El portal está detrás de Cloudflare y puede estar bloqueando el request " +
      "del servidor (IP de datacenter). Si persiste, hay que correr la sync " +
      `desde una IP residencial o configurar un proxy. Respuesta: ${snippet}`
    );
  }

  // Optimizely B2B sets auth cookies (`Authentication` or `.AspNet.Cookies`). Detect them.
  const hasAuthCookie = Object.keys(cookies).some(
    (k) => /auth|session|aspnet|spire/i.test(k)
  );
  if (!hasAuthCookie) {
    throw new Error(
      "Login devolvió 200 pero no se recibieron cookies de sesión. Verificá las credenciales o el formato esperado por el backend."
    );
  }

  return { cookies };
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function apiGet<T = unknown>(session: Session, path: string): Promise<T> {
  const res = await rawRequestOnce(
    `${BASE}${path}`,
    "GET",
    browserHeaders({
      Accept: "application/json",
      Referer: `${BASE}/`,
      Cookie: cookieStr(session.cookies),
    })
  );
  if (res.status !== 200) {
    throw new Error(`my.sonance.com API ${res.status} en GET ${path}: ${res.body.slice(0, 150)}`);
  }
  return JSON.parse(res.body) as T;
}

async function apiPost<T = unknown>(
  session: Session,
  path: string,
  body: unknown
): Promise<T> {
  const payload = JSON.stringify(body);
  const res = await rawRequestOnce(
    `${BASE}${path}`,
    "POST",
    browserHeaders({
      Accept: "application/json",
      "Content-Type": "application/json",
      "Content-Length": String(Buffer.byteLength(payload)),
      Origin: BASE,
      Referer: `${BASE}/`,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieStr(session.cookies),
    }),
    payload
  );
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(
      `my.sonance.com API ${res.status} en POST ${path}: ${res.body.slice(0, 150)}`
    );
  }
  return JSON.parse(res.body) as T;
}

// ── categories (brand discovery) ──────────────────────────────────────────────

interface CategoryNode {
  id: string;
  name?: string;
  shortDescription?: string;
  urlSegment?: string;
  subCategories?: CategoryNode[];
}

/**
 * Marca paraguas. Cuando un SKU aparece tanto en pn-sonance como en una sub-marca
 * (pn-blaze, pn-trufig, pn-iport, pn-james), la sub-marca gana — pn-sonance es
 * el catálogo general que contiene a casi todos.
 */
const UMBRELLA_BRAND_SLUG = "pn-sonance";

interface BrandCategory {
  id: string;
  slug: string;
  brand: SonanceBrand;
}

/**
 * Descubre TODAS las top-level categorías que representan una marca en mySonance.
 * Cualquier categoría con slug "pn-*" se considera una marca. La display name
 * se toma del campo `name` de la categoría (ej. "BLAZE BY SONANCE", "APPAREL").
 *
 * Esto reemplaza el mapeo hardcoded — si Sonance agrega una nueva marca con slug
 * pn-X, automáticamente entra al sync sin tener que tocar el código.
 */
async function fetchBrandCategories(session: Session): Promise<BrandCategory[]> {
  const data = await apiGet<{ categories?: Array<CategoryNode & { shortDescription?: string }> }>(
    session,
    "/api/v1/categories/?maxDepth=1"
  );
  const cats = data.categories ?? [];
  const out: BrandCategory[] = [];
  for (const c of cats) {
    const slug = (c.urlSegment ?? "").toLowerCase();
    if (!slug.startsWith("pn-")) continue;
    // El display name "lindo" viene en shortDescription (ej. "BLAZE BY SONANCE").
    // c.name suele venir con underscore (ej. "pn_blaze") — fallback final.
    const displayName = String(
      c.shortDescription ?? c.name ?? slug.replace(/^pn-/, "").toUpperCase()
    ).trim();
    if (!displayName) continue;
    out.push({ id: c.id, slug, brand: displayName });
  }
  return out;
}

// ── products ──────────────────────────────────────────────────────────────────

export interface PortalProductListing {
  id: string;
  productNumber?: string;
  productTitle?: string;
  unitListPrice?: number;
  unitListPriceDisplay?: string;
  canShowPrice?: boolean;
  isDiscontinued?: boolean;
  cantBuy?: boolean;
  quoteRequired?: boolean;
  brand?: { name?: string } | null;
  customerUnitOfMeasure?: string | null;
  customerProductNumber?: string | null;
  productLine?: unknown;
  urlSegment?: string;
  // Disponible con expand=attributes
  attributeTypes?: Array<{
    name?: string;
    label?: string;
    attributeValues?: Array<{ value?: string; valueDisplay?: string }>;
  }>;
  // Imagen principal — útil para el preview
  smallImagePath?: string;
  mediumImagePath?: string;
  largeImagePath?: string;
}

interface ProductsResponse {
  products?: PortalProductListing[];
  pagination?: {
    page?: number;
    pageSize?: number;
    totalItemCount?: number;
    numberOfPages?: number;
  };
}

export async function fetchProductsBySearch(
  session: Session,
  term: string
): Promise<PortalProductListing[]> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return [];
  const fetchPage = (page: number) => apiGet<ProductsResponse>(
    session,
    `/api/v2/products?search=${encodeURIComponent(cleanTerm)}&pageSize=200&page=${page}&expand=attributes`
  );
  const firstPage = await fetchPage(1);
  const products = [...(firstPage.products ?? [])];
  const totalPages = Math.min(3, Math.max(1, firstPage.pagination?.numberOfPages ?? 1));
  for (let page = 2; page <= totalPages; page++) {
    const response = await fetchPage(page);
    products.push(...(response.products ?? []));
  }
  return products;
}

export async function fetchSkusBySearch(
  session: Session,
  term: string
): Promise<string[]> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return [];
  try {
    const fetchPage = (page: number) => apiGet<ProductsResponse>(
      session,
      `/api/v2/products?search=${encodeURIComponent(cleanTerm)}&pageSize=250&page=${page}`
    );
    const firstPage = await fetchPage(1);
    const pages = [firstPage];
    const totalPages = Math.min(3, Math.max(1, firstPage.pagination?.numberOfPages ?? 1));
    for (let page = 2; page <= totalPages; page++) {
      pages.push(await fetchPage(page));
    }
    const skus = new Set<string>();
    for (const response of pages) {
      for (const product of response.products ?? []) {
        const sku = typeof product.productNumber === "string"
          ? product.productNumber.trim()
          : "";
        if (sku) skus.add(sku);
      }
    }
    return [...skus];
  } catch {
    return [];
  }
}

const PAGE_SIZE = 200;

async function fetchProductsForCategory(
  session: Session,
  categoryId: string,
  expand = "attributes,detail"
): Promise<PortalProductListing[]> {
  const fetchPage = async (page: number): Promise<ProductsResponse> => {
    // expand=attributes — necesario para traer attributeTypes (Product Category,
    // Product Sub Category, specs técnicos) que vienen vacíos sin expand.
    // detail expande el objeto detail{} con info de modelo, SKU, dimensiones.
    return apiGet<ProductsResponse>(
      session,
      `/api/v2/products?categoryId=${categoryId}&pageSize=${PAGE_SIZE}&page=${page}&expand=${expand}`
    );
  };

  const firstPage = await fetchPage(1);
  const all = [...(firstPage.products ?? [])];
  const totalPages = firstPage.pagination?.numberOfPages ?? 1;
  const pageConcurrency = 5;
  for (let startPage = 2; startPage <= totalPages; startPage += pageConcurrency) {
    const pageNumbers = Array.from(
      { length: Math.min(pageConcurrency, totalPages - startPage + 1) },
      (_, index) => startPage + index
    );
    const pages = await Promise.all(pageNumbers.map(fetchPage));
    for (const page of pages) all.push(...(page.products ?? []));
  }
  return all;
}

// ── rich product detail (V1 endpoint, ~113 campos) ────────────────────────────

export interface PortalImage {
  id: string;
  name: string;
  imageAltText?: string;
  smallImagePath?: string;
  mediumImagePath?: string;
  largeImagePath?: string;
  imageType?: string;
  sortOrder?: number;
}

export interface PortalAttributeValue {
  id: string;
  value: string;
  valueDisplay?: string;
  sortOrder?: number;
}

export interface PortalAttributeType {
  id: string;
  name: string;
  label?: string;
  isFilter?: boolean;
  isSearchable?: boolean;
  sortOrder?: number;
  attributeValues?: PortalAttributeValue[];
}

export interface PortalDocument {
  id: string;
  name?: string;
  description?: string;
  documentType?: string;
  fileTypeString?: string;
  filePath?: string;
  fileUrl?: string;
  createdOn?: string;
}

export interface PortalAccessory {
  id: string;
  productNumber?: string;
  productTitle?: string;
  shortDescription?: string;
  unitListPrice?: number;
  canShowPrice?: boolean;
  smallImagePath?: string;
  mediumImagePath?: string;
  urlSegment?: string;
}

export interface PortalProductDetail {
  id: string;
  productNumber?: string;
  productTitle?: string;
  shortDescription?: string;
  htmlContent?: string | null;
  erpNumber?: string;
  modelNumber?: string;
  manufacturerItem?: string;
  metaDescription?: string;
  metaKeywords?: string;
  pageTitle?: string;

  /** Wholesale / list de catálogo (NO es “My Price” del dealer). */
  basicListPrice?: number;
  basicSalePrice?: number;
  basicSaleStartDate?: string | null;
  basicSaleEndDate?: string | null;
  salePriceLabel?: string;
  canShowPrice?: boolean;
  quoteRequired?: boolean;
  currencySymbol?: string;
  /** En algunos responses V1 ya viene el precio de sesión (dealer). */
  unitListPrice?: number;
  /** Precio calculado para el dealer logueado. unitNetPrice = “My Price” en la web. */
  pricing?: PortalProductPrice;

  isActive?: boolean;
  isDiscontinued?: boolean;
  cantBuy?: boolean;
  canAddToCart?: boolean;
  canBackOrder?: boolean;
  isHazardousGood?: boolean;
  hasMsds?: boolean;
  minimumOrderQty?: number;
  multipleSaleQty?: number;

  largeImagePath?: string;
  mediumImagePath?: string;
  smallImagePath?: string;
  altText?: string;
  productImages?: PortalImage[];

  brand?: { id: string; name: string; urlSegment?: string; logoSmallImagePath?: string };
  attributeTypes?: PortalAttributeType[];
  documents?: PortalDocument[];
  accessories?: PortalAccessory[];
  crossSells?: PortalAccessory[];
  alsoPurchasedProducts?: PortalAccessory[];

  shippingHeight?: string | number | null;
  shippingLength?: string | number | null;
  shippingWidth?: string | number | null;
  shippingWeight?: string | number | null;
  qtyPerShippingPackage?: number;

  availability?: { messageType?: string; message?: string; requiresRealTimeInventory?: boolean };
  badges?: { name?: string }[];

  properties?: Record<string, unknown>;
  urlSegment?: string;
  productDetailUrl?: string;
  canonicalUrl?: string;
}

const RICH_EXPAND =
  "specifications,documents,attributes,detail,accessories,crosssells,brand";

export interface PortalProductPrice {
  productId?: string;
  unitNetPrice?: number;
  unitNetPriceDisplay?: string;
  unitListPrice?: number;
  unitListPriceDisplay?: string;
  unitRegularPrice?: number;
  unitCost?: number;
  isOnSale?: boolean;
  quoteRequired?: boolean;
  additionalResults?: {
    showMyPrice?: boolean | string;
    showWholesale?: boolean | string;
    showMsrp?: boolean | string;
  };
}

function positivePrice(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  return value;
}

/**
 * Precio de costo FOB para Soundtec = “My Price” del dealer en my.sonance.com.
 *
 * En la UI de Sonance:
 * - MY PRICE  → pricing.unitNetPrice (vía POST /api/v1/realtimepricing)
 * - WHOLESALE → unitListPrice / basicListPrice (NO usar como costo)
 * - MSRP      → otro campo de listado
 *
 * Nunca caemos a wholesale: eso era el bug (ej. SKU 93802 → 960 en vez de 768).
 */
export function resolveSonanceMyPrice(input: {
  pricing?: PortalProductPrice | null;
  /** @deprecated Ignorado: unitListPrice es WHOLESALE, no My Price. */
  unitListPrice?: number | null;
  /** @deprecated Ignorado: listing.price suele ser wholesale. */
  listingPrice?: number | null;
  /** @deprecated Ignorado: basicListPrice es wholesale/list de catálogo. */
  basicListPrice?: number | null;
}): number | undefined {
  return positivePrice(input.pricing?.unitNetPrice);
}

/**
 * POST /api/v1/realtimepricing — el mismo endpoint que usa la web para MY PRICE.
 * Devuelve un map productId → pricing (unitNetPrice = My Price).
 */
export async function fetchRealtimePricing(
  session: Session,
  productIds: string[],
  qtyOrdered = 1
): Promise<Map<string, PortalProductPrice>> {
  const out = new Map<string, PortalProductPrice>();
  const ids = [...new Set(productIds.map((id) => id.trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const CHUNK = 25;
  for (let i = 0; i < ids.length; i += CHUNK) {
    const chunk = ids.slice(i, i + CHUNK);
    try {
      const data = await apiPost<{
        realTimePricingResults?: PortalProductPrice[];
      }>(session, "/api/v1/realtimepricing", {
        productPriceParameters: chunk.map((productId) => ({
          productId,
          qtyOrdered,
          unitOfMeasure: "",
        })),
      });
      for (const result of data.realTimePricingResults ?? []) {
        const id = result.productId?.trim();
        if (id) out.set(id, result);
      }
    } catch (e) {
      console.error(
        `sonance-portal: realtimepricing falló para ${chunk.length} productos`,
        e
      );
    }
  }
  return out;
}

/** @deprecated Usar fetchRealtimePricing — /products/{id}/price no trae el My Price del dealer. */
export async function fetchProductPrice(
  session: Session,
  productId: string
): Promise<PortalProductPrice | null> {
  const map = await fetchRealtimePricing(session, [productId]);
  return map.get(productId) ?? null;
}

export async function fetchProductDetailRawOrThrow(
  session: Session,
  productId: string,
  options?: { includeRealtimePrice?: boolean }
): Promise<PortalProductDetail | null> {
  const includeRealtimePrice = options?.includeRealtimePrice !== false;
  const data = await apiGet<{ product?: PortalProductDetail }>(
    session,
    `/api/v1/products/${productId}?expand=${RICH_EXPAND}`
  );
  const product = data.product ?? null;
  if (!product) return null;
  if (includeRealtimePrice) {
    const priceMap = await fetchRealtimePricing(session, [productId]);
    const price = priceMap.get(productId);
    if (price) {
      product.pricing = {
        ...(product.pricing ?? {}),
        ...price,
      };
    }
  }
  return product;
}

export async function fetchProductDetailRaw(
  session: Session,
  productId: string
): Promise<PortalProductDetail | null> {
  try {
    return await fetchProductDetailRawOrThrow(session, productId);
  } catch (e) {
    console.error(`sonance-portal: failed to fetch detail for ${productId}`, e);
    return null;
  }
}

/**
 * Login una vez y devuelve la session, para que el caller pueda hacer múltiples
 * llamadas (fetchProductDetailRaw, etc.) reutilizando cookies.
 */
export async function openSession(): Promise<Session> {
  return login();
}

// ── public API ────────────────────────────────────────────────────────────────

export interface PortalSyncResult {
  products: SonanceProduct[];
  /** Conteos POST-deduplicación. Suma == products.length. */
  brandCounts: Record<SonanceBrand, number>;
  discoveredBrands: string[]; // category slugs we found
  /** Conteos crudos por categoría del portal (antes de dedup).
   *  rawCategoryCounts[X] >= brandCounts[X] cuando X comparte SKUs con otras marcas. */
  rawCategoryCounts?: Record<SonanceBrand, number>;
}

function asStr(v: unknown, fallback = ""): string {
  if (typeof v === "string") return v;
  if (v == null) return fallback;
  return String(v);
}

/** Extrae el primer valor (display o raw) de un attributeType buscando por label/name. */
function findAttrValue(
  attrs: PortalProductListing["attributeTypes"],
  ...labelsOrNames: string[]
): string {
  if (!Array.isArray(attrs)) return "";
  const wanted = labelsOrNames.map((s) => s.toLowerCase());
  for (const a of attrs) {
    const lbl = asStr(a.label ?? a.name).toLowerCase();
    if (!wanted.includes(lbl)) continue;
    const vals = (a.attributeValues ?? [])
      .map((v) => asStr(v.valueDisplay ?? v.value).trim())
      .filter(Boolean);
    if (vals.length > 0) return vals[0];
  }
  return "";
}

function mapPortalToProduct(p: PortalProductListing, brand: SonanceBrand): SonanceProduct | null {
  const sku = asStr(p.productNumber).trim();
  const name = asStr(p.productTitle).trim();
  const price = typeof p.unitListPrice === "number" ? p.unitListPrice : NaN;
  if (!sku || !name || !isFinite(price) || price <= 0) return null;
  if (!p.canShowPrice) return null;

  // Categoría real: viene en attributeTypes (Product Category / Sub / Super)
  // con expand=attributes. productLine queda como fallback (suele ser null).
  const categoryFromAttrs =
    findAttrValue(p.attributeTypes, "Product Category") ||
    findAttrValue(p.attributeTypes, "Product Super Category");
  const subcategoryFromAttrs = findAttrValue(p.attributeTypes, "Product Sub Category");

  return {
    name,
    supplierSku: sku,
    price,
    uom: asStr(p.customerUnitOfMeasure, "EA").trim() || "EA",
    brand,
    category: categoryFromAttrs || asStr(p.productLine).trim(),
    subcategory: subcategoryFromAttrs,
  };
}

/**
 * Búsqueda rápida de un único SKU. Usa el parámetro search del listing v2
 * en vez de bajar todo el catálogo de cada marca (mucho más rápido para
 * resoluciones puntuales).
 */
export async function findProductIdBySku(
  session: Session,
  sku: string
): Promise<string | null> {
  const cleanSku = sku.trim();
  if (!cleanSku) return null;
  try {
    const data = await apiGet<{ products?: Array<{ id: string; productNumber?: string }> }>(
      session,
      `/api/v2/products?search=${encodeURIComponent(cleanSku)}&pageSize=20`
    );
    const products = data.products ?? [];
    const upper = cleanSku.toUpperCase();
    const exact = products.find(
      (p) => String(p.productNumber ?? "").toUpperCase() === upper
    );
    return exact?.id ?? null;
  } catch (e) {
    console.error("findProductIdBySku error", e);
    return null;
  }
}

/**
 * Devuelve un mapa SKU → productId del portal, para poder pedir el detalle
 * (V1 endpoint) usando el id de Sonance. Itera todas las marcas conocidas.
 */
export async function buildSkuToIdMap(session: Session): Promise<Map<string, string>> {
  const brandCats = await fetchBrandCategories(session);
  const map = new Map<string, string>();
  for (const bc of brandCats) {
    const items = await fetchProductsForCategory(session, bc.id);
    for (const p of items) {
      const sku = (p.productNumber ?? "").trim();
      if (sku && p.id) map.set(sku, p.id);
    }
  }
  return map;
}

function brandPriority(slug: string): number {
  // pn-sonance es el catálogo paraguas — debe iterarse PRIMERO para que las
  // sub-marcas (que aparecen también ahí) ganen via last-wins en el dedup.
  return slug === UMBRELLA_BRAND_SLUG ? 1 : 10;
}

export async function fetchFromPortal(existingSession?: Session): Promise<PortalSyncResult> {
  const session = existingSession ?? await login();
  const brandCats = await fetchBrandCategories(session);
  if (brandCats.length === 0) {
    throw new Error(
      "No se encontraron categorías de marca en my.sonance.com. La estructura del catálogo puede haber cambiado."
    );
  }

  // Orden de iteración: paraguas primero (prio 1), sub-marcas después (prio 10).
  // Así la última asignación en bySku.set() es la más específica.
  brandCats.sort((a, b) => brandPriority(a.slug) - brandPriority(b.slug));

  const products: SonanceProduct[] = [];
  const rawCategoryCounts: Record<string, number> = {};

  for (const bc of brandCats) {
    const portalItems = await fetchProductsForCategory(session, bc.id);
    let added = 0;
    for (const p of portalItems) {
      const mapped = mapPortalToProduct(p, bc.brand);
      if (mapped) {
        products.push(mapped);
        added++;
      }
    }
    rawCategoryCounts[bc.brand] = (rawCategoryCounts[bc.brand] ?? 0) + added;
  }

  // Deduplicate by SKU (último gana — gracias al orden por prioridad, las
  // submarcas específicas ganan sobre SONANCE genérico)
  const bySku = new Map<string, SonanceProduct>();
  for (const p of products) bySku.set(p.supplierSku, p);
  const deduped = Array.from(bySku.values());

  // brandCounts ahora se calcula POST-dedup → la suma cuadra con el total
  const brandCounts: Record<string, number> = {};
  for (const p of deduped) {
    brandCounts[p.brand] = (brandCounts[p.brand] ?? 0) + 1;
  }

  return {
    products: deduped,
    brandCounts: brandCounts as Record<SonanceBrand, number>,
    discoveredBrands: brandCats.map((b) => b.slug),
    // Para diagnóstico: cuántos productos hay por categoría en el portal
    // (puede ser > brandCounts[brand] si la marca comparte SKUs con SONANCE)
    rawCategoryCounts: rawCategoryCounts as Record<SonanceBrand, number>,
  };
}

export async function fetchFromPortalWithIds(
  existingSession?: Session
): Promise<{
  products: Array<{ product: SonanceProduct; portalId: string }>;
  brandCounts: Record<string, number>;
  total: number;
}> {
  const session = existingSession ?? await login();
  const brandCats = await fetchBrandCategories(session);
  if (brandCats.length === 0) {
    throw new Error(
      "No se encontraron categorías de marca en my.sonance.com. La estructura del catálogo puede haber cambiado."
    );
  }

  brandCats.sort((a, b) => brandPriority(a.slug) - brandPriority(b.slug));

  const categoryResults: Array<{
    brandCategory: (typeof brandCats)[number];
    portalItems: PortalProductListing[];
  }> = [];
  const categoryConcurrency = 3;
  for (let index = 0; index < brandCats.length; index += categoryConcurrency) {
    const chunk = brandCats.slice(index, index + categoryConcurrency);
    const results = await Promise.all(
      chunk.map(async (brandCategory) => ({
        brandCategory,
        portalItems: await fetchProductsForCategory(session, brandCategory.id, "attributes"),
      }))
    );
    categoryResults.push(...results);
  }

  const bySku = new Map<string, { product: SonanceProduct; portalId: string }>();
  for (const { brandCategory, portalItems } of categoryResults) {
    for (const portalItem of portalItems) {
      const product = mapPortalToProduct(portalItem, brandCategory.brand);
      if (product) {
        bySku.set(product.supplierSku, { product, portalId: portalItem.id });
      }
    }
  }

  const products = Array.from(bySku.values());
  const brandCounts: Record<string, number> = {};
  for (const { product } of products) {
    brandCounts[product.brand] = (brandCounts[product.brand] ?? 0) + 1;
  }

  return { products, brandCounts, total: products.length };
}
