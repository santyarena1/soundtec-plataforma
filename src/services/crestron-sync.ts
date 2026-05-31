import https from "node:https";
import { StockStatus } from "@prisma/client";
import { getSetting } from "@/lib/settings";

const BASE = "https://crestronlatam.xtrabone.mx";

export interface CrestronItem {
  ItemCode: string;
  ItemName: string;
  Price: number;
  Discount: number | null;
  Currency: string;
  "07": string;
  "11": string;
  "07_available": number;
  "11_available": number;
  U_ETDCUS: string;
  Gpo: string;
  OnHand: number;
  IsCommited: number;
  OnOrder: number;
}

// ── low-level HTTPS helper ────────────────────────────────────────────────────
// Uses node:https directly to avoid undici's opaque-redirect limitation which
// swallows Set-Cookie headers when redirect:"manual" is used with Next.js fetch.

interface RawResponse {
  status: number;
  headers: NodeJS.Dict<string | string[]>;
  body: string;
}

function rawRequestOnce(
  url: string,
  method: string,
  reqHeaders: Record<string, string>,
  body?: string
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: reqHeaders,
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
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// Follows 3xx redirects (GET only) accumulating Set-Cookie headers.
// Returns finalUrl — the URL that actually served the response (after all redirects).
// POST stays non-redirecting so we capture the 302 cookies directly.
async function rawRequest(
  url: string,
  method: string,
  reqHeaders: Record<string, string>,
  body?: string,
  accCookies: Record<string, string> = {}
): Promise<RawResponse & { allCookies: Record<string, string>; finalUrl: string }> {
  const res = await rawRequestOnce(url, method, reqHeaders, body);
  const newCookies = { ...accCookies, ...parseCookiesRaw(rawSetCookies(res.headers)) };

  if (
    method === "GET" &&
    res.status >= 300 &&
    res.status < 400 &&
    typeof res.headers["location"] === "string"
  ) {
    const location = res.headers["location"] as string;
    const next = location.startsWith("http") ? location : new URL(location, url).toString();
    return rawRequest(
      next,
      "GET",
      { ...reqHeaders, Cookie: cookieStrFromMap(newCookies) },
      undefined,
      newCookies
    );
  }

  return { ...res, allCookies: newCookies, finalUrl: url };
}

// ── cookie helpers ────────────────────────────────────────────────────────────

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

function cookieStrFromMap(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

// ── auth ──────────────────────────────────────────────────────────────────────

async function login(): Promise<Record<string, string>> {
  const username = await getSetting("crestron.username", "");
  const password = await getSetting("crestron.password", "");

  if (!username || !password) {
    throw new Error("Credenciales de Crestron no configuradas en el sistema.");
  }

  // Login URL is /login/ — /accounts/login/ redirects there with a bad `next`.
  // We use ?next=/clientes/precios so Django redirects us correctly after auth.
  const LOGIN_URL = `${BASE}/login/?next=/clientes/precios`;
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0";

  // 1. GET login page → CSRF token + initial cookies
  const getRes = await rawRequest(LOGIN_URL, "GET", {
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  });

  const initCookies = getRes.allCookies;

  const csrfMatch =
    getRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/) ??
    getRes.body.match(/csrfmiddlewaretoken[^>]*value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] ?? initCookies["csrftoken"] ?? "";

  if (!csrfToken) {
    throw new Error("No se pudo obtener el token CSRF del sitio de Crestron.");
  }

  // 2. POST credentials
  const postBody = new URLSearchParams({
    username,
    password,
    csrfmiddlewaretoken: csrfToken,
    next: "/clientes/precios",
  }).toString();

  const postRes = await rawRequestOnce(LOGIN_URL, "POST", {
    "Content-Type": "application/x-www-form-urlencoded",
    "Content-Length": String(Buffer.byteLength(postBody)),
    Cookie: cookieStrFromMap(initCookies),
    Referer: LOGIN_URL,
    Origin: BASE,
    "User-Agent": UA,
    Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  }, postBody);

  const authCookies = {
    ...initCookies,
    ...parseCookiesRaw(rawSetCookies(postRes.headers)),
  };

  if (!authCookies["sessionid"]) {
    // No sessionid means wrong credentials (Django re-renders the login page)
    const bodySnippet = postRes.body
      .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);
    throw new Error(
      `Login a Crestron fallido (HTTP ${postRes.status}). ` +
      `Verificá usuario/contraseña en /admin/crestron-sync. Respuesta: ${bodySnippet}`
    );
  }

  // 3. Visit /clientes/precios to "activate" the session — some Django setups
  // require this before the API will accept the user as authorized.
  const precioRes = await rawRequest(`${BASE}/clientes/precios`, "GET", {
    Cookie: cookieStrFromMap(authCookies),
    Referer: LOGIN_URL,
    "User-Agent": UA,
    Accept: "text/html,*/*",
  }, undefined, authCookies);

  // Merge any new cookies (csrftoken may rotate)
  return { ...authCookies, ...precioRes.allCookies };
}

// ── DataTables API ────────────────────────────────────────────────────────────

function buildDtBody(start: number, length: number): string {
  // Minimal DataTables server-side params — no columns array.
  // Column names like "07"/"11" are not valid Python identifiers and cause
  // a Django FieldError (→ 500) when the backend tries to use them for ordering.
  return new URLSearchParams({
    draw: "1",
    start: String(start),
    length: String(length),
    "search[value]": "",
    "search[regex]": "false",
    "order[0][column]": "0",
    "order[0][dir]": "asc",
  }).toString();
}

async function fetchPage(
  cookies: Record<string, string>,
  start: number,
  length: number
): Promise<{ data: CrestronItem[]; recordsTotal: number }> {
  const body = buildDtBody(start, length);
  const res = await rawRequestOnce(
    `${BASE}/api/SBO_PROD_USA/precios-dt`,
    "POST",
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(body)),
      "X-CSRFToken": cookies["csrftoken"] ?? "",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieStrFromMap(cookies),
      Referer: `${BASE}/clientes/precios`,
      "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
    },
    body
  );

  if (res.status !== 200) {
    // Strip HTML tags for a readable error message
    const detail = res.body.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 300);
    throw new Error(`Crestron API ${res.status}: ${detail}`);
  }

  return JSON.parse(res.body) as { data: CrestronItem[]; recordsTotal: number };
}

async function fetchAllItems(cookies: Record<string, string>): Promise<CrestronItem[]> {
  // Try fetching all at once first
  try {
    const result = await fetchPage(cookies, 0, 2000);
    if (Array.isArray(result.data) && result.data.length > 0) return result.data;
  } catch {
    // fall through to paginated fetch
  }

  const PAGE = 100;
  const first = await fetchPage(cookies, 0, PAGE);
  const total = first.recordsTotal;
  const all: CrestronItem[] = [...first.data];

  const pages = Math.ceil(total / PAGE);
  for (let p = 1; p < pages; p++) {
    const page = await fetchPage(cookies, p * PAGE, PAGE);
    all.push(...page.data);
  }

  return all;
}

// ── public API ────────────────────────────────────────────────────────────────

export async function fetchCrestronPriceList(): Promise<CrestronItem[]> {
  const cookies = await login();
  return fetchAllItems(cookies);
}

export function toCrestronStockStatus(item: CrestronItem): StockStatus {
  const avail = (item["07_available"] ?? 0) + (item["11_available"] ?? 0);
  if (avail > 5) return StockStatus.IN_STOCK;
  if (avail > 0) return StockStatus.LOW_STOCK;
  if ((item.OnOrder ?? 0) > 0) return StockStatus.ON_REQUEST;
  return StockStatus.OUT_OF_STOCK;
}
