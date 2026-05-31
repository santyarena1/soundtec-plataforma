import { StockStatus } from "@prisma/client";

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

function getSetCookies(headers: Headers): string[] {
  if (typeof (headers as any).getSetCookie === "function") {
    return (headers as any).getSetCookie() as string[];
  }
  const raw = headers.get("set-cookie");
  return raw ? [raw] : [];
}

function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) {
      out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
    }
  }
  return out;
}

function cookieStr(cookies: Record<string, string>): string {
  return Object.entries(cookies)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

async function login(): Promise<Record<string, string>> {
  const username =
    process.env.CRESTRON_USERNAME ?? "comex@soundtec.com.ar";
  const password =
    process.env.CRESTRON_PASSWORD ?? "stecpass23";

  // GET login page → grab CSRF token and initial cookie
  const getRes = await fetch(`${BASE}/accounts/login/`, {
    headers: { "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0" },
  });
  const initCookies = parseCookies(getSetCookies(getRes.headers));
  const html = await getRes.text();

  const csrfMatch =
    html.match(/name="csrfmiddlewaretoken"\s+value="([^"]+)"/) ??
    html.match(/csrfmiddlewaretoken.*?value="([^"]+)"/);
  const csrfToken = csrfMatch?.[1] ?? initCookies["csrftoken"] ?? "";

  // POST credentials
  const postRes = await fetch(`${BASE}/accounts/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: cookieStr(initCookies),
      Referer: `${BASE}/accounts/login/`,
      "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
    },
    body: new URLSearchParams({
      username,
      password,
      csrfmiddlewaretoken: csrfToken,
      next: "/clientes/precios",
    }).toString(),
    redirect: "manual",
  });

  const authCookies = {
    ...initCookies,
    ...parseCookies(getSetCookies(postRes.headers)),
  };

  if (!authCookies["sessionid"]) {
    throw new Error(
      "Login a Crestron fallido: no se obtuvo sesión. Verificá las credenciales."
    );
  }

  return authCookies;
}

const DT_COLUMNS = [
  "ItemCode",
  "ItemName",
  "Price",
  "Discount",
  "Price", // "Precio final" column reuses Price
  "Currency",
  "07",
  "11",
  "U_ETDCUS",
  "Gpo",
];

function buildDtParams(start: number, length: number): string {
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
  const csrf = cookies["csrftoken"] ?? "";
  const res = await fetch(`${BASE}/api/SBO_PROD_USA/precios-dt`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-CSRFToken": csrf,
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieStr(cookies),
      Referer: `${BASE}/clientes/precios`,
      "User-Agent": "Mozilla/5.0 Soundtec-Sync/1.0",
    },
    body: buildDtParams(start, length),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Crestron API ${res.status}: ${txt.slice(0, 200)}`);
  }

  return res.json() as Promise<{ data: CrestronItem[]; recordsTotal: number }>;
}

async function fetchAllItems(
  cookies: Record<string, string>
): Promise<CrestronItem[]> {
  // Try fetching all at once (length = 2000, larger than max known)
  try {
    const result = await fetchPage(cookies, 0, 2000);
    if (Array.isArray(result.data) && result.data.length > 0) {
      return result.data;
    }
  } catch {
    // fall through to paginated fetch
  }

  // Paginate
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

export async function fetchCrestronPriceList(): Promise<CrestronItem[]> {
  const cookies = await login();
  return fetchAllItems(cookies);
}

export function toCrestronStockStatus(item: CrestronItem): StockStatus {
  const avail =
    (item["07_available"] ?? 0) + (item["11_available"] ?? 0);
  if (avail > 5) return StockStatus.IN_STOCK;
  if (avail > 0) return StockStatus.LOW_STOCK;
  if ((item.OnOrder ?? 0) > 0) return StockStatus.ON_REQUEST;
  return StockStatus.OUT_OF_STOCK;
}
