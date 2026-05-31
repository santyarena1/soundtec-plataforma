import https from "node:https";
import * as XLSX from "xlsx";

export type SonanceBrand = "SONANCE" | "IPORT" | "BLAZE by SONANCE";

export interface SonanceProduct {
  name: string;
  supplierSku: string;
  price: number;
  uom: string;
  brand: SonanceBrand;
  category: string;
  subcategory: string;
}

export interface SonanceParseResult {
  fileType: "sonance-iport" | "blaze";
  products: SonanceProduct[];
  brandCounts: Record<string, number>;
  categoryCounts: Record<string, number>;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function isNumber(v: unknown): v is number {
  return typeof v === "number" && isFinite(v);
}

function isSkuString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Keep only the product name part — strip trailing whitespace/parens notes */
function cleanName(s: string): string {
  return s.trim().replace(/\s{2,}/g, " ");
}

/**
 * Detect if a row is a section header (no numeric SKU, no numeric price in expected cols).
 * In Sonance/IPORT format: col[1] (B) is empty or non-numeric  →  header
 */
function isSonanceHeader(row: unknown[]): boolean {
  const colA = row[0];
  const colB = row[1];
  const colC = row[2];
  if (!colA || String(colA).trim() === "") return false;
  // Data row: col B is a number (numeric part#) AND col C is a number (price)
  if (isNumber(colB) && isNumber(colC)) return false;
  // Otherwise it's a header/section row
  return true;
}

/**
 * SONANCE / IPORT file parser.
 * Sheet "Price List" — columns: A=Name, B=PartNum(numeric), C=Price, D=UoM
 */
function parseSonanceIport(ws: XLSX.WorkSheet): SonanceProduct[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const products: SonanceProduct[] = [];
  let brand: SonanceBrand = "SONANCE";
  let category = "";
  let subcategory = "";

  // Depth heuristic: first non-blank header sets category; subsequent ones set subcategory
  // We track the last two header texts
  let lastHeaderDepth = 0;

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colA = row[0];
    const colB = row[1];
    const colC = row[2];
    const colD = row[3];

    const nameStr = String(colA ?? "").trim();
    if (!nameStr) continue;

    // ── Brand switch ──
    if (nameStr === "IPORT" && !colB && !colC) {
      brand = "IPORT";
      category = "";
      subcategory = "";
      lastHeaderDepth = 0;
      continue;
    }

    // ── Section header ──
    if (isSonanceHeader(row)) {
      // Skip pure-noise lines
      if (
        nameStr.startsWith("Custom Grille") ||
        nameStr.startsWith("IN-CEILING SPEAKERS - ORDER") ||
        nameStr.startsWith("IN-CEILING GRILLES") ||
        nameStr.startsWith("PENDANT SPEAKERS - ORDER") ||
        nameStr.startsWith("PENDANT GRILLES") ||
        nameStr.startsWith("SURFACE MOUNT SPEAKERS") ||
        nameStr.startsWith("SURFACE MOUNT GRILLES") ||
        nameStr.startsWith("DOUBLE CHECK") ||
        nameStr.startsWith("THE DISCREET") ||
        nameStr.startsWith("*IN PLACE OF") ||
        nameStr.startsWith("93335") ||
        nameStr.startsWith("WHILE SUPPLIES LAST") ||
        nameStr.startsWith("PRICE LIST INDEX")
      ) {
        continue;
      }

      // Decide if this sets category or subcategory
      // Heuristic: ALL_CAPS long names → category; shorter / mixed case → subcategory
      const isAllCaps =
        nameStr === nameStr.toUpperCase() && nameStr.length > 6;

      if (isAllCaps || lastHeaderDepth === 0) {
        category = nameStr;
        subcategory = "";
        lastHeaderDepth = 1;
      } else {
        subcategory = nameStr;
        lastHeaderDepth = 2;
      }
      continue;
    }

    // ── Product row ──
    if (!isNumber(colB) || !isNumber(colC)) continue;
    if (colC <= 0) continue;

    products.push({
      name: cleanName(nameStr),
      supplierSku: String(Math.round(colB)), // numeric part# → string
      price: colC,
      uom: String(colD ?? "EA").trim() || "EA",
      brand,
      category,
      subcategory,
    });
  }

  return products;
}

/**
 * BLAZE file parser.
 * Sheet "USD - BLAZE PRICE LIST" — range starts at B1.
 * After sheet_to_json with header:1, the array index offset makes:
 *   row[0] = col B = Name, row[1] = col C = SKU, row[2] = col D = Price, row[3] = col E = UoM
 */
function parseBlaze(ws: XLSX.WorkSheet): SonanceProduct[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1,
    defval: "",
  });

  const products: SonanceProduct[] = [];
  let category = "";
  let subcategory = "";

  for (const row of rows) {
    if (!Array.isArray(row)) continue;

    const colName = row[0];
    const colSku = row[1];
    const colPrice = row[2];
    const colUom = row[3];

    const nameStr = String(colName ?? "").trim();
    if (!nameStr) continue;

    // Skip the header row
    if (nameStr === "PRICE LIST CONFIDENTIAL") continue;
    if (nameStr.startsWith("(UNI)") || nameStr.startsWith("(US)")) continue;

    // Section header: SKU is empty
    if (!colSku || String(colSku).trim() === "") {
      category = nameStr;
      subcategory = "";
      continue;
    }

    // Sub-section (no price):
    if (!isNumber(colPrice) || colPrice <= 0) {
      if (!isSkuString(colSku)) {
        subcategory = nameStr;
      }
      continue;
    }

    if (!isSkuString(colSku)) continue;

    products.push({
      name: cleanName(nameStr),
      supplierSku: String(colSku).trim(),
      price: colPrice,
      uom: String(colUom ?? "EACH").trim() || "EACH",
      brand: "BLAZE by SONANCE",
      category,
      subcategory,
    });
  }

  return products;
}

// ── Box download ─────────────────────────────────────────────────────────────

/**
 * Download a file from a public Box shared link.
 * Uses the Box Content API with the BoxApi header — no auth token needed for public links.
 * URL format expected: https://*.app.box.com/s/{sharedToken}/file/{fileId}
 */
// ── Box download helpers ──────────────────────────────────────────────────────

function isExcelBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4B;
}

function parseSetCookies(headers: NodeJS.Dict<string | string[]>): Record<string, string> {
  const raw = headers["set-cookie"];
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
  const out: Record<string, string> = {};
  for (const h of list) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

function cookieHeader(map: Record<string, string>): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

// Binary HTTP request with optional body, redirect following, cookie accumulation.
// Uses node:https directly — fetch/undici can mangle the redirect chain for Box URLs.
function boxRequest(
  url: string,
  method: "GET" | "POST",
  headers: Record<string, string>,
  body: string | null = null,
  cookies: Record<string, string> = {},
  hops = 12,
  timeoutMs = 30000
): Promise<{ status: number; body: Buffer; cookies: Record<string, string>; finalUrl: string }> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const finalHeaders = { ...headers };
    if (body !== null) {
      finalHeaders["Content-Length"] = String(Buffer.byteLength(body));
    }
    const req = https.request(
      { hostname: u.hostname, path: u.pathname + u.search, method, headers: finalHeaders, timeout: timeoutMs },
      (res) => {
        const newCookies = { ...cookies, ...parseSetCookies(res.headers) };
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          const loc = res.headers["location"] as string | undefined;
          // Only follow redirects on GET — POST 3xx responses are real responses, not redirects to follow
          if (method === "GET" && res.statusCode! >= 300 && res.statusCode! < 400 && loc && hops > 0) {
            const next = loc.startsWith("http") ? loc : new URL(loc, url).toString();
            boxRequest(
              next,
              "GET",
              { ...headers, Cookie: cookieHeader(newCookies), Referer: url },
              null,
              newCookies,
              hops - 1,
              timeoutMs
            ).then(resolve).catch(reject);
          } else {
            resolve({ status: res.statusCode ?? 0, body: buf, cookies: newCookies, finalUrl: url });
          }
        });
      }
    );
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout (${timeoutMs}ms) en ${method} ${url}`)); });
    req.on("error", reject);
    if (body !== null) req.write(body);
    req.end();
  });
}

/**
 * Replicates the Box enduserapp flow used by the browser to download files
 * from public shared links (folder-based shares).
 *
 * 3-step flow (reverse-engineered from observed XHR traffic):
 *   1. GET the shared file page → cookies (csrf-token, z, ...) + requestToken
 *      embedded in inline script as `"requestToken":"<64 hex>"`
 *   2. POST /app-api/enduserapp/elements/tokens with Request-Token header and
 *      X-Box-EndUser-API: sharedName=<token>. Body: {"fileIDs":["<fileId>"]}
 *      Returns: {"<fileId>":{"read":"<scoped access token>"}}
 *   3. GET https://api.box.com/2.0/files/<fileId>/content with
 *      Authorization: Bearer <access_token> → follow redirect to file content
 */
export async function downloadFromBoxLink(sharedUrl: string): Promise<Buffer> {
  const match = sharedUrl.match(/https?:\/\/([^/]+)\/s\/([^/]+)\/file\/(\d+)/);
  if (!match) throw new Error(`URL de Box inválida: ${sharedUrl}`);
  const [, host, sharedToken, fileId] = match;

  const sharedLink = `https://${host}/s/${sharedToken}`;
  const filePageUrl = `${sharedLink}/file/${fileId}`;
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36";

  // Step 1: GET the page to capture cookies + requestToken from inline script
  const pageRes = await boxRequest(filePageUrl, "GET", {
    "User-Agent": ua,
    Accept: "text/html,application/xhtml+xml,*/*",
  });
  const html = pageRes.body.toString("utf8");
  const tokenMatch = html.match(/"requestToken"\s*:\s*"([a-f0-9]+)"/);
  const requestToken = tokenMatch?.[1] ?? "";
  if (!requestToken) {
    throw new Error("No se pudo extraer requestToken del HTML de Box. La página puede haber cambiado de estructura.");
  }

  // Step 2: POST to elements/tokens to get a Bearer access token for this file
  const csrfCookie = pageRes.cookies["csrf-token"] ?? "";
  const tokensRes = await boxRequest(
    `https://${host}/app-api/enduserapp/elements/tokens`,
    "POST",
    {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Box-Client-Name": "enduserapp",
      "X-Box-Client-Version": "23.548.0",
      "X-Box-Priority": "u=2",
      "Request-Token": requestToken,
      "X-Request-Token": requestToken,
      "x-csrf-token": csrfCookie,
      "X-Box-EndUser-API": `sharedName=${sharedToken}`,
      Cookie: cookieHeader(pageRes.cookies),
      Referer: filePageUrl,
      Origin: `https://${host}`,
      "User-Agent": ua,
    },
    JSON.stringify({ fileIDs: [fileId] }),
    pageRes.cookies
  );

  if (tokensRes.status !== 200) {
    const detail = tokensRes.body.toString("utf8").slice(0, 200);
    throw new Error(`Box elements/tokens devolvió ${tokensRes.status}: ${detail}`);
  }

  const tokensJson = JSON.parse(tokensRes.body.toString("utf8")) as Record<string, { read?: string }>;
  const accessToken = tokensJson[fileId]?.read;
  if (!accessToken) {
    throw new Error(`Box no devolvió un access token para fileId=${fileId}.`);
  }

  // Step 3: GET the file content with Bearer auth — Box redirects to dl.boxcloud.com
  const fileRes = await boxRequest(
    `https://api.box.com/2.0/files/${fileId}/content`,
    "GET",
    {
      Authorization: `Bearer ${accessToken}`,
      "User-Agent": ua,
      Accept: "application/octet-stream,*/*",
    }
  );

  if (!isExcelBuffer(fileRes.body)) {
    throw new Error(
      `Box content devolvió un archivo no-Excel (status=${fileRes.status}, size=${fileRes.body.length}). ` +
      `Verificá que el link sea de un .xlsx válido.`
    );
  }
  return fileRes.body;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function parseSonanceExcel(buffer: Buffer): SonanceParseResult {
  const wb = XLSX.read(buffer, { type: "buffer" });

  // Detect file type by sheet name
  const sheetNames = wb.SheetNames;
  const isBlazeFile = sheetNames.some((s) =>
    s.toLowerCase().includes("blaze")
  );

  let products: SonanceProduct[];
  let fileType: SonanceParseResult["fileType"];

  if (isBlazeFile) {
    fileType = "blaze";
    const ws = wb.Sheets[sheetNames[0]];
    products = parseBlaze(ws);
  } else {
    fileType = "sonance-iport";
    const ws = wb.Sheets["Price List"] ?? wb.Sheets[sheetNames[0]];
    products = parseSonanceIport(ws);

    // Also parse "Painted Grille Pricing" sheet if present
    const grillWs = wb.Sheets["Painted Grille Pricing"];
    if (grillWs) {
      const grillRows = XLSX.utils.sheet_to_json<unknown[]>(grillWs, {
        header: 1,
        defval: "",
      });
      // This sheet: col A=Name, col B=PartNum, col C=Price(non-painted), col D=UoM, col E=Price(painted)
      let grillCat = "PAINTED GRILLE PRICING";
      for (const row of grillRows) {
        if (!Array.isArray(row)) continue;
        const a = row[0];
        const b = row[1];
        const c = row[2];
        const d = row[3];
        if (!a || String(a).trim() === "") continue;
        if (!isNumber(b) || !isNumber(c)) {
          grillCat = String(a).trim();
          continue;
        }
        if (c <= 0) continue;
        products.push({
          name: cleanName(String(a)),
          supplierSku: String(Math.round(b)),
          price: c,
          uom: String(d ?? "EA").trim() || "EA",
          brand: "SONANCE",
          category: grillCat,
          subcategory: "",
        });
      }
    }
  }

  // Deduplicate by SKU (keep last occurrence)
  const bySkuMap = new Map<string, SonanceProduct>();
  for (const p of products) {
    bySkuMap.set(p.supplierSku, p);
  }
  const deduplicated = Array.from(bySkuMap.values());

  const brandCounts: Record<string, number> = {};
  const categoryCounts: Record<string, number> = {};
  for (const p of deduplicated) {
    brandCounts[p.brand] = (brandCounts[p.brand] ?? 0) + 1;
    const catKey = `${p.brand} › ${p.category}`;
    categoryCounts[catKey] = (categoryCounts[catKey] ?? 0) + 1;
  }

  return { fileType, products: deduplicated, brandCounts, categoryCounts };
}
