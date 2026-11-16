/**
 * Cliente mínimo de la API HTTP de Resend (sin SDK). `fetchImpl` y `sleep`
 * se inyectan para probarlo sin red. Respeta el límite de pedidos: ante un
 * 429 espera lo que diga Retry-After (o 1 s, 2 s, 4 s…) y reintenta; los 5xx
 * y cortes de red también se reintentan. Los 4xx restantes no (el pedido está mal).
 */

export const RESEND_API = "https://api.resend.com";
/** Máximo de mails por llamada a /emails/batch. */
export const RESEND_BATCH_MAX = 100;

export type ResendEmail = {
  from: string;
  to: string[];
  subject: string;
  html: string;
  text: string;
  reply_to?: string[];
  headers?: Record<string, string>;
  tags?: Array<{ name: string; value: string }>;
};

export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
}>;

export type ResendOptions = {
  apiKey: string;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  maxAttempts?: number;
};

export type ResendResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string };

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Segundos de Retry-After (número o fecha HTTP) → ms; si no hay, espera exponencial. */
export function retryDelayMs(retryAfter: string | null, attempt: number, now = Date.now()): number {
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.min(60_000, Math.ceil(seconds * 1000));
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.min(60_000, Math.max(0, date - now));
  }
  return Math.min(30_000, 1000 * 2 ** attempt);
}

function errorText(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string; name?: string };
    if (parsed.message) return `${parsed.message}${parsed.name ? ` (${parsed.name})` : ""}`;
  } catch {
    /* cuerpo no JSON */
  }
  return body.slice(0, 300) || `Resend respondió ${status}`;
}

async function call<T>(options: ResendOptions, method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}): Promise<ResendResult<T>> {
  const fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchLike);
  const sleep = options.sleep ?? defaultSleep;
  const maxAttempts = options.maxAttempts ?? 4;
  let last: ResendResult<T> = { ok: false, status: 0, error: "Sin respuesta de Resend." };
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetchImpl(`${RESEND_API}${path}`, {
        method,
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", "User-Agent": "soundtec-portal/1.0", ...extraHeaders },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      if (res.ok) return { ok: true, data: (text ? JSON.parse(text) : {}) as T };
      last = { ok: false, status: res.status, error: errorText(res.status, text) };
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt === maxAttempts - 1) return last;
      await sleep(retryDelayMs(res.headers.get("retry-after"), attempt));
    } catch (error) {
      last = { ok: false, status: 0, error: error instanceof Error ? error.message : "Fallo de red." };
      if (attempt === maxAttempts - 1) return last;
      await sleep(retryDelayMs(null, attempt));
    }
  }
  return last;
}

/**
 * Manda hasta 100 mails en una llamada. Con la misma `idempotencyKey`, Resend
 * no los vuelve a mandar (durante 24 h): si una tanda se corta a la mitad y se
 * reintenta, nadie recibe dos veces.
 */
export async function sendBatch(options: ResendOptions, emails: ResendEmail[], idempotencyKey: string): Promise<ResendResult<{ ids: string[] }>> {
  if (!emails.length) return { ok: true, data: { ids: [] } };
  if (emails.length > RESEND_BATCH_MAX) return { ok: false, status: 0, error: `Hasta ${RESEND_BATCH_MAX} mails por tanda.` };
  const result = await call<{ data?: Array<{ id: string }> }>(options, "POST", "/emails/batch", emails, { "Idempotency-Key": idempotencyKey.slice(0, 256) });
  if (!result.ok) return result;
  return { ok: true, data: { ids: (result.data.data ?? []).map((d) => d.id) } };
}

export async function sendSingle(options: ResendOptions, email: ResendEmail): Promise<ResendResult<{ id: string }>> {
  return call<{ id: string }>(options, "POST", "/emails", email);
}

export type ResendDomain = { id: string; name: string; status: string; region?: string; created_at?: string };
export type ResendDnsRecord = { record: string; name: string; type: string; ttl?: string; status: string; value: string; priority?: number };
export type ResendDomainDetail = ResendDomain & { records?: ResendDnsRecord[]; open_tracking?: boolean; click_tracking?: boolean };

export async function listDomains(options: ResendOptions): Promise<ResendResult<ResendDomain[]>> {
  const result = await call<{ data?: ResendDomain[] }>(options, "GET", "/domains");
  return result.ok ? { ok: true, data: result.data.data ?? [] } : result;
}

export async function getDomain(options: ResendOptions, id: string): Promise<ResendResult<ResendDomainDetail>> {
  return call<ResendDomainDetail>(options, "GET", `/domains/${encodeURIComponent(id)}`);
}

export async function createDomain(options: ResendOptions, name: string): Promise<ResendResult<ResendDomainDetail>> {
  return call<ResendDomainDetail>(options, "POST", "/domains", { name });
}

export async function verifyDomain(options: ResendOptions, id: string): Promise<ResendResult<{ id: string }>> {
  return call<{ id: string }>(options, "POST", `/domains/${encodeURIComponent(id)}/verify`);
}

/** Activa el seguimiento de aperturas y clics del dominio (lo hace Resend: píxel y enlaces redirigidos). */
export async function setDomainTracking(options: ResendOptions, id: string, tracking: { open: boolean; click: boolean }): Promise<ResendResult<{ id: string }>> {
  return call<{ id: string }>(options, "PATCH", `/domains/${encodeURIComponent(id)}`, { open_tracking: tracking.open, click_tracking: tracking.click });
}
