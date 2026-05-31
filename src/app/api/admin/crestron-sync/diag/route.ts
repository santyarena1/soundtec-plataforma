import { NextResponse } from "next/server";
import https from "node:https";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting } from "@/lib/settings";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const BASE = "https://crestronlatam.xtrabone.mx";

interface StepResult {
  step: string;
  url?: string;
  status?: number;
  bodyPreview?: string;
  setCookieRaw?: string[];
  cookieNames?: string[];
  headers?: Record<string, string | string[] | undefined>;
  durationMs?: number;
  error?: string;
}

function rawRequestOnce(url: string, method: string, headers: Record<string, string>, body?: string, timeoutMs = 15000) {
  return new Promise<{ status: number; headers: NodeJS.Dict<string | string[]>; body: string }>((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({
      hostname: u.hostname, path: u.pathname + u.search, method, headers, timeout: timeoutMs,
    }, (res) => {
      let data = ""; res.setEncoding("utf8");
      res.on("data", (c) => (data += c));
      res.on("end", () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: data }));
    });
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

function getCookieNames(headers: NodeJS.Dict<string | string[]>): { raw: string[]; names: string[] } {
  const v = headers["set-cookie"];
  const list = Array.isArray(v) ? v : v ? [v] : [];
  return {
    raw: list.map(c => c.slice(0, 150)),
    names: list.map(c => c.split(";")[0].split("=")[0].trim()),
  };
}

function parseCookies(setCookieHeaders: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of setCookieHeaders) {
    const [pair] = h.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) out[pair.slice(0, eq).trim()] = pair.slice(eq + 1).trim();
  }
  return out;
}

function cookieStr(map: Record<string, string>): string {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

// GET diagnostic — runs each step and reports details to identify the failure point
export async function GET() {
  await requireAdmin();
  const steps: StepResult[] = [];
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0";

  let outboundIp = "unknown";
  try {
    const ipRes = await rawRequestOnce("https://api.ipify.org?format=json", "GET", { "User-Agent": "diag" });
    outboundIp = ipRes.body;
  } catch (e) { outboundIp = `error: ${(e as Error).message}`; }

  // Step 1: GET login page
  let t0 = Date.now();
  let cookies: Record<string, string> = {};
  let csrfToken = "";
  let loginHtml = "";
  try {
    const r = await rawRequestOnce(`${BASE}/login/?next=/clientes/precios`, "GET", {
      "User-Agent": UA, Accept: "text/html,*/*",
    });
    const setCookieInfo = getCookieNames(r.headers);
    cookies = parseCookies(setCookieInfo.raw);
    loginHtml = r.body;
    const csrfMatch = r.body.match(/csrfmiddlewaretoken[^>]*value="([^"]+)"/);
    csrfToken = csrfMatch?.[1] ?? "";
    steps.push({
      step: "1. GET /login/?next=/clientes/precios",
      url: `${BASE}/login/?next=/clientes/precios`,
      status: r.status,
      bodyPreview: `len=${r.body.length}, has-csrf-input=${!!csrfMatch}, has-title=${/<title>/.test(r.body)}`,
      setCookieRaw: setCookieInfo.raw,
      cookieNames: setCookieInfo.names,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    steps.push({ step: "1. GET login", error: (e as Error).message, durationMs: Date.now() - t0 });
    return NextResponse.json({ outboundIp, steps });
  }

  if (!csrfToken) {
    return NextResponse.json({
      outboundIp,
      steps,
      conclusion: "No se pudo extraer csrfmiddlewaretoken del HTML de login. La página puede haber cambiado de estructura.",
    });
  }

  // Step 2: POST login
  const username = await getSetting("crestron.username", "");
  const password = await getSetting("crestron.password", "");
  const userPreview = username ? `${username.slice(0, 3)}***@${username.split("@")[1] ?? "?"}` : "(no configurado)";
  const passPreview = password ? `len=${password.length}` : "(no configurado)";

  t0 = Date.now();
  const postBody = new URLSearchParams({ username, password, csrfmiddlewaretoken: csrfToken, next: "/clientes/precios" }).toString();
  let postR: Awaited<ReturnType<typeof rawRequestOnce>> | null = null;
  try {
    postR = await rawRequestOnce(`${BASE}/login/?next=/clientes/precios`, "POST", {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(postBody)),
      Cookie: cookieStr(cookies),
      Referer: `${BASE}/login/?next=/clientes/precios`,
      Origin: BASE,
      "User-Agent": UA,
      Accept: "text/html,*/*",
    }, postBody);
    const setCookieInfo = getCookieNames(postR.headers);
    cookies = { ...cookies, ...parseCookies(setCookieInfo.raw) };
    steps.push({
      step: "2. POST credentials",
      status: postR.status,
      bodyPreview: postR.body.slice(0, 400).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim(),
      headers: { location: postR.headers.location },
      setCookieRaw: setCookieInfo.raw,
      cookieNames: setCookieInfo.names,
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    steps.push({ step: "2. POST login", error: (e as Error).message, durationMs: Date.now() - t0 });
    return NextResponse.json({ outboundIp, credentialsPreview: { user: userPreview, pass: passPreview }, steps });
  }

  const sessionId = cookies["sessionid"];
  if (!sessionId) {
    return NextResponse.json({
      outboundIp,
      credentialsPreview: { user: userPreview, pass: passPreview },
      steps,
      conclusion:
        postR && postR.status >= 300 && postR.status < 400
          ? `Login devolvió ${postR.status} → ${postR.headers.location} pero sin sessionid. Las credenciales probablemente son incorrectas (Django redirige sin crear sesión).`
          : `Login no creó sessionid (status ${postR?.status}). Credenciales incorrectas o el formulario requiere otro campo.`,
    });
  }

  // Step 3: GET /clientes/precios — initializes session state and reveals the DataTable config
  t0 = Date.now();
  let preciosHtml = "";
  try {
    const r = await rawRequestOnce(`${BASE}/clientes/precios`, "GET", {
      Cookie: cookieStr(cookies),
      Referer: `${BASE}/login/`,
      "User-Agent": UA,
      Accept: "text/html,*/*",
    });
    const setCookieInfo = getCookieNames(r.headers);
    cookies = { ...cookies, ...parseCookies(setCookieInfo.raw) };
    preciosHtml = r.body;

    // Extract DataTable ajax config & any hidden inputs/data attrs
    const ajaxConfig = r.body.match(/ajax\s*:\s*[{][\s\S]{0,800}?[}]/)?.[0];
    const ajaxUrl = r.body.match(/url\s*:\s*["']([^"']+)["']/)?.[1];
    const ajaxData = r.body.match(/data\s*:\s*function[^{]*{[\s\S]{0,500}?return[^}]+}/)?.[0];
    const dataAttrs = Array.from(r.body.matchAll(/data-(?:customer|branch|cliente|sucursal|user)[^=]*=["']([^"']+)["']/gi)).map(m => m[0]).slice(0, 5);
    const hiddenInputs = Array.from(r.body.matchAll(/<input[^>]*type=["']hidden["'][^>]*>/gi)).map(m => m[0].slice(0, 200)).slice(0, 10);

    steps.push({
      step: "3. GET /clientes/precios",
      status: r.status,
      bodyPreview: `len=${r.body.length}, title=${(r.body.match(/<title>([^<]+)</)?.[1] ?? "").slice(0, 60)}`,
      setCookieRaw: setCookieInfo.raw,
      cookieNames: setCookieInfo.names,
      durationMs: Date.now() - t0,
      headers: {
        ajaxConfig: (ajaxConfig ?? "(no ajax config block found)").slice(0, 600),
        ajaxUrl,
        ajaxData: ajaxData?.slice(0, 400),
        dataAttrs: dataAttrs.join(" | "),
        hiddenInputs: hiddenInputs.join(" || "),
      },
    });
  } catch (e) {
    steps.push({ step: "3. GET /clientes/precios", error: (e as Error).message, durationMs: Date.now() - t0 });
  }

  // Step 4: POST API — include cardcode extracted from page
  t0 = Date.now();
  const cardcodeMatch =
    preciosHtml.match(/id=["']selectCardCode["'][^>]*value=["']([^"']+)["']/) ??
    preciosHtml.match(/value=["']([^"']+)["'][^>]*id=["']selectCardCode["']/);
  const cardcode = cardcodeMatch?.[1] ?? "";
  const apiBody = new URLSearchParams({
    draw: "1", start: "0", length: "10",
    "search[value]": "", "search[regex]": "false",
    cardcode,
  }).toString();
  try {
    const r = await rawRequestOnce(`${BASE}/api/SBO_PROD_USA/precios-dt`, "POST", {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": String(Buffer.byteLength(apiBody)),
      "X-CSRFToken": cookies["csrftoken"] ?? "",
      "X-Requested-With": "XMLHttpRequest",
      Cookie: cookieStr(cookies),
      Referer: `${BASE}/clientes/precios`,
      Origin: BASE,
      "User-Agent": UA,
      Accept: "application/json, text/javascript, */*",
    }, apiBody);
    const bodyClean = r.body.slice(0, 800).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    steps.push({
      step: "4. POST /api/SBO_PROD_USA/precios-dt",
      status: r.status,
      bodyPreview: bodyClean,
      headers: {
        "content-type": r.headers["content-type"],
        server: r.headers.server,
      },
      durationMs: Date.now() - t0,
    });
  } catch (e) {
    steps.push({ step: "4. POST API", error: (e as Error).message, durationMs: Date.now() - t0 });
  }

  // Extra hint: also search the precios HTML for any reference to the API URL with parameters
  const apiCallHints = preciosHtml
    ? Array.from(preciosHtml.matchAll(/precios-dt[^"'\s]{0,200}/g)).map(m => m[0]).slice(0, 5).join(" || ")
    : "";

  return NextResponse.json({
    outboundIp,
    credentialsPreview: { user: userPreview, pass: passPreview },
    cookieNamesFinal: Object.keys(cookies),
    apiCallHintsInHtml: apiCallHints,
    steps,
  });
}
