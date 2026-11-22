/**
 * Descarga de imágenes de sitios externos (fabricantes, distribuidores, CDN)
 * pensada para que la acepten como si fuera un navegador:
 *  - User-Agent y Accept de Chrome, Referer del sitio de origen (antihotlink);
 *  - sigue hasta 5 redirecciones, validando cada salto;
 *  - timeout por intento y un reintento corto ante caídas o 5xx;
 *  - corta si pasa el tope de bytes.
 * Seguridad (SSRF): la IP se valida DESPUÉS de resolver el DNS y la conexión
 * se hace a esa misma IP (lookup propio), así un dominio que apunta a la red
 * interna no pasa ni con «DNS rebinding».
 */
import http from "node:http";
import https from "node:https";
import tls from "node:tls";
import { X509Certificate } from "node:crypto";
import dns from "node:dns";
import type { LookupFunction } from "node:net";
import { checkRemoteImageUrl, isPrivateIp } from "@/lib/remote-image/url-guard";
import { ImageRejectError } from "@/lib/remote-image/reasons";

export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024;
/** Sin recibir nada durante este tiempo se corta; la descarga completa tiene un tope aparte (fotos de 5 MB de docs.crestron.com tardan). */
const TIMEOUT_MS = 12_000;
const TOTAL_TIMEOUT_MS = 25_000;
const MAX_REDIRECTS = 5;
const RETRY_DELAY_MS = 600;

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
  "Accept-Language": "es-AR,es;q=0.9,en;q=0.8",
  "Accept-Encoding": "identity",
  "Sec-Fetch-Dest": "image",
  "Sec-Fetch-Mode": "no-cors",
  "Sec-Fetch-Site": "cross-site",
};

export interface DownloadedImage {
  bytes: Buffer;
  contentType: string;
  finalUrl: string;
}

export interface DownloadOptions {
  referer?: string | null;
  maxBytes?: number;
  timeoutMs?: number;
  /** Solo para pruebas: resolver DNS propio. */
  lookup?: typeof dns.lookup;
}

/** lookup que se niega a conectar a IPs privadas (lo usa http/https al abrir el socket). */
export function guardedLookup(resolver: typeof dns.lookup = dns.lookup): LookupFunction {
  return (hostname, options, callback) => {
    resolver(hostname, { ...options, all: true }, (error, addresses) => {
      if (error) return callback(error, "", 0);
      const list = (Array.isArray(addresses) ? addresses : [{ address: String(addresses), family: 4 }]) as dns.LookupAddress[];
      const blocked = list.find((entry) => isPrivateIp(entry.address));
      if (blocked || list.length === 0) {
        const err = Object.assign(new Error(`IP interna bloqueada: ${hostname}`), { code: "EPRIVATEHOST" });
        return callback(err, "", 0);
      }
      if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
      callback(null, list[0]!.address, list[0]!.family);
    });
  };
}

/**
 * Sitios con la cadena de certificados incompleta (les falta el intermedio,
 * p. ej. cdn-images.av-iq.com): el navegador lo baja solo desde la dirección
 * «CA Issuers» del certificado (AIA) y Node no. Se hace lo mismo acá y se
 * vuelve a validar la cadena completa contra las raíces de siempre: no se
 * desactiva ninguna verificación.
 */
const INCOMPLETE_CHAIN = new Set(["UNABLE_TO_VERIFY_LEAF_SIGNATURE", "UNABLE_TO_GET_ISSUER_CERT_LOCALLY", "UNABLE_TO_GET_ISSUER_CERT"]);
const extraCaByHost = new Map<string, string[]>();

function issuerUrlOf(url: URL, opts: DownloadOptions & { timeoutMs: number }): Promise<string | null> {
  return new Promise((resolve) => {
    // Solo se lee el certificado que presenta el sitio; no se manda ningún dato por esta conexión.
    const socket = tls.connect(
      { host: url.hostname, port: Number(url.port) || 443, servername: url.hostname, rejectUnauthorized: false, lookup: guardedLookup(opts.lookup), timeout: opts.timeoutMs },
      () => {
        const uri = socket.getPeerCertificate()?.infoAccess?.["CA Issuers - URI"]?.[0] ?? null;
        socket.end();
        resolve(uri);
      },
    );
    socket.on("error", () => resolve(null));
    socket.on("timeout", () => {
      socket.destroy();
      resolve(null);
    });
  });
}

const pendingIntermediates = new Map<string, Promise<boolean>>();

/** Baja el certificado intermedio que falta (una sola vez por sitio, aunque haya descargas en paralelo). */
function loadMissingIntermediate(url: URL, opts: Required<Pick<DownloadOptions, "maxBytes" | "timeoutMs">> & DownloadOptions): Promise<boolean> {
  const cached = pendingIntermediates.get(url.hostname);
  if (cached) return cached;
  const task = (async () => {
    const issuer = await issuerUrlOf(url, opts);
    const checked = issuer ? checkRemoteImageUrl(issuer) : null;
    if (!checked?.ok) return false;
    try {
      const hop = await requestOnce(checked.url, { "User-Agent": BROWSER_HEADERS["User-Agent"] }, { ...opts, maxBytes: 64 * 1024 });
      if (!hop.bytes) return false;
      extraCaByHost.set(url.hostname, [new X509Certificate(hop.bytes).toString()]);
      return true;
    } catch {
      return false;
    }
  })();
  pendingIntermediates.set(url.hostname, task);
  return task;
}

interface HopResult {
  status: number;
  headers: http.IncomingHttpHeaders;
  bytes?: Buffer;
}

function requestOnce(url: URL, headers: Record<string, string>, opts: Required<Pick<DownloadOptions, "maxBytes" | "timeoutMs">> & DownloadOptions): Promise<HopResult> {
  return new Promise((resolve, reject) => {
    const client = url.protocol === "https:" ? https : http;
    const req = client.request(
      url,
      {
        method: "GET",
        headers,
        lookup: guardedLookup(opts.lookup),
        timeout: opts.timeoutMs,
        ...(extraCaByHost.has(url.hostname) ? { ca: [...tls.rootCertificates, ...extraCaByHost.get(url.hostname)!] } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          return resolve({ status, headers: res.headers });
        }
        if (status < 200 || status >= 300) {
          res.resume();
          return resolve({ status, headers: res.headers });
        }
        const declared = Number(res.headers["content-length"] || 0);
        if (declared > opts.maxBytes) {
          res.destroy();
          return reject(new ImageRejectError("too-large"));
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > opts.maxBytes) {
            res.destroy();
            reject(new ImageRejectError("too-large"));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () => resolve({ status, headers: res.headers, bytes: Buffer.concat(chunks) }));
        res.on("error", reject);
      },
    );
    const deadline = setTimeout(() => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })), Math.max(opts.timeoutMs, TOTAL_TIMEOUT_MS));
    req.on("timeout", () => req.destroy(Object.assign(new Error("timeout"), { code: "ETIMEDOUT" })));
    req.on("error", (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    req.on("close", () => clearTimeout(deadline));
    req.end();
  });
}

function toRejectError(error: unknown): ImageRejectError {
  if (error instanceof ImageRejectError) return error;
  const code = (error as { code?: string })?.code ?? "";
  if (code === "EPRIVATEHOST") return new ImageRejectError("private-host");
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return new ImageRejectError("dns-failed");
  if (code === "ETIMEDOUT" || code === "ESOCKETTIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") return new ImageRejectError("timeout");
  return new ImageRejectError("network", code || undefined);
}

function statusError(status: number): ImageRejectError {
  if (status === 401 || status === 403) return new ImageRejectError("hotlink-blocked", `HTTP ${status}`);
  if (status === 404 || status === 410) return new ImageRejectError("not-found");
  return new ImageRejectError("http-error", `HTTP ${status}`);
}

const isRetryable = (error: ImageRejectError) =>
  error.reason === "timeout" || error.reason === "network" || (error.reason === "http-error" && /HTTP (5\d\d|429)/.test(error.detail ?? ""));

async function followRedirects(start: URL, referer: string | null, opts: Required<Pick<DownloadOptions, "maxBytes" | "timeoutMs">> & DownloadOptions): Promise<DownloadedImage> {
  let current = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (referer) headers.Referer = referer;
    let result: HopResult;
    try {
      result = await requestOnce(current, headers, opts);
    } catch (error) {
      const code = (error as { code?: string })?.code ?? "";
      if (!INCOMPLETE_CHAIN.has(code) || !(await loadMissingIntermediate(current, opts))) throw toRejectError(error);
      try {
        result = await requestOnce(current, headers, opts);
      } catch (retryError) {
        throw toRejectError(retryError);
      }
    }
    if (result.status >= 300 && result.status < 400 && result.headers.location) {
      const next = checkRemoteImageUrl(new URL(String(result.headers.location), current).toString());
      if (!next.ok) throw new ImageRejectError(next.reason);
      current = next.url;
      continue;
    }
    if (!result.bytes) throw statusError(result.status);
    const contentType = String(result.headers["content-type"] || "").split(";")[0]!.trim().toLowerCase();
    return { bytes: result.bytes, contentType, finalUrl: current.toString() };
  }
  throw new ImageRejectError("too-many-redirects");
}

/**
 * Descarga la imagen. Si el sitio la niega (401/403) con Referer, prueba sin
 * él y con el de la propia imagen (algunos CDN aceptan solo uno de los dos).
 */
export async function downloadRemoteImage(rawUrl: string, options: DownloadOptions = {}): Promise<DownloadedImage> {
  const checked = checkRemoteImageUrl(rawUrl);
  if (!checked.ok) throw new ImageRejectError(checked.reason);
  const opts = { maxBytes: MAX_DOWNLOAD_BYTES, timeoutMs: TIMEOUT_MS, ...options };
  const referers = [...new Set([options.referer ?? null, null, `${checked.url.origin}/`])];

  let lastError: ImageRejectError = new ImageRejectError("network");
  for (const referer of referers) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        return await followRedirects(checked.url, referer, opts);
      } catch (error) {
        lastError = toRejectError(error);
        if (!isRetryable(lastError) || attempt === 1) break;
        await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      }
    }
    // Solo tiene sentido cambiar de Referer si el sitio nos rechazó.
    if (lastError.reason !== "hotlink-blocked") break;
  }
  throw lastError;
}

/** og:image / twitter:image de una página (para fotos que Google no da con dirección propia). */
export async function findPageImage(pageUrl: string, options: DownloadOptions = {}): Promise<string | null> {
  try {
    const page = await downloadRemoteImage(pageUrl, { ...options, maxBytes: 3 * 1024 * 1024 });
    const html = page.bytes.toString("utf8");
    const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
    for (const key of ["og:image:secure_url", "og:image", "twitter:image", "twitter:image:src"]) {
      for (const tag of tags) {
        const prop = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
        const content = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i)?.[1];
        if (prop === key && content) {
          const absolute = new URL(content.replace(/&amp;/g, "&"), page.finalUrl).toString();
          if (checkRemoteImageUrl(absolute).ok) return absolute;
        }
      }
    }
  } catch {
    // Sin página o sin og:image: se sigue con la miniatura.
  }
  return null;
}
