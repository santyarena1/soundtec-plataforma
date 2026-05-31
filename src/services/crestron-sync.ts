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

  // GET login page — follows redirects, accumulates cookies
  const getRes = await rawRequest(`${BASE}/accounts/login/`, "GET", {
    "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
    Accept: "text/html",
  });

  const initCookies = getRes.allCookies;

  const csrfMatch =
    getRes.body.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/) ??
    getRes.body.match(/csrfmiddlewaretoken[^>]*value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] ?? initCookies["csrftoken"] ?? "";

  if (!csrfToken) {
    throw new Error("No se pudo obtener el token CSRF del sitio de Crestron.");
  }

  // POST to the final URL after redirects (not necessarily the original /accounts/login/)
  const loginUrl = getRes.finalUrl;
  const postBody = new URLSearchParams({
    username,
    password,
    csrfmiddlewaretoken: csrfToken,
    next: "/clientes/precios",
  }).toString();

  const postRes = await rawRequestOnce(
    loginUrl,
    "POST",
    {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(postBody)),
      Cookie: cookieStrFromMap(initCookies),
      Referer: loginUrl,
      "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
      Accept: "text/html",
    },
    postBody
  );

  const authCookies = {
    ...initCookies,
    ...parseCookiesRaw(rawSetCookies(postRes.headers)),
  };

  if (!authCookies["sessionid"]) {
    throw new Error(
      `Login a Crestron fallido (HTTP ${postRes.status}). Verificá las credenciales configuradas.`
    );
  }

  return authCookies;
}

// ── DataTables API ────────────────────────────────────────────────────────────

const DT_COLUMNS = [
  "ItemCode",
  "ItemName",
  "Price",
  "Discount",
  "Price",
  "Currency",
  "07",
  "11",
  "U_ETDCUS",
  "Gpo",
];

function buildDtBody(start: number, length: number): string {
  const p = new URLSearchParams({
    draw: "1",
    start: String(start),
    length: String(length),
    "search[value]": "",
    "search[regex]": "false",
  });
  DT_COLUMNS.forEach((col, i) => {
    p.set(`columns[${i}][data]`, col);
    p.set(`columns[${i}][searchable]`, "true");
    p.set(`columns[${i}][orderable]`, "true");
    p.set(`columns[${i}][search][value]`, "");
    p.set(`columns[${i}][search][regex]`, "false");
  });
  return p.toString();
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
    throw new Error(`Crestron API ${res.status}: ${res.body.slice(0, 200)}`);
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
