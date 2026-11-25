/**
 * «Ver como este usuario»: un admin mira el sistema como lo ve otro usuario,
 * en solo lectura. La vista vive en una cookie propia (httpOnly) firmada con
 * HMAC-SHA256; no toca la sesión real del admin ni usa la clave del otro.
 *
 * Solo Web Crypto: el mismo código corre en el middleware (edge) y en el
 * servidor (Node). Sin base de datos: funciones puras para poder probarlas.
 */

export const IMPERSONATION_COOKIE = "st_ver_como";
/** Duración de la vista; «Renovar» la extiende otro tanto. */
export const IMPERSONATION_TTL_MS = 30 * 60 * 1000;
/** Tope de vida de la cookie en el navegador (la validez real la da `exp`). */
export const IMPERSONATION_COOKIE_MAX_AGE = 60 * 60 * 8;
/** Salida de la vista: la única ruta que sigue abierta con la vista activa, además de leer. */
export const IMPERSONATION_EXIT_PATH = "/ver-como/salir";
export const IMPERSONATION_RENEW_PATH = "/ver-como/renovar";
/** Mensaje que ve quien intenta cambiar algo durante la vista. */
export const READ_ONLY_MESSAGE = "Estás viendo como otro usuario: solo lectura. Salí de la vista para hacer cambios.";

const VERSION = "v1";
const KEY_LABEL = "soundtec:ver-como:v1|";

export interface ImpersonationPayload {
  /** Admin real (actor). */
  a: string;
  /** Usuario que se está viendo. */
  t: string;
  /** sessionVersion del admin al empezar: si cambia (cerrar sesiones, reset de clave), la vista cae. */
  sv: number;
  /** Registro de auditoría (ImpersonationLog.id). */
  lid: string;
  iat: number;
  exp: number;
  /** Tipo del usuario visto al abrir la vista (el middleware no tiene base: con esto lleva el catálogo público al portal). */
  tr?: string;
}

export type VerifyResult =
  | { ok: true; payload: ImpersonationPayload }
  | { ok: false; reason: "formato" | "firma" | "vencida" | "sin_clave" };

const encoder = new TextEncoder();

function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function bytesFromB64url(value: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(value)) return null;
  try {
    const bin = atob(value.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((value.length + 3) % 4));
    const out = new Uint8Array(new ArrayBuffer(bin.length));
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch {
    return null;
  }
}

/** Secreto del servidor (el mismo de NextAuth), separado por etiqueta para este uso. */
export function impersonationSecret(env: Record<string, string | undefined> = process.env): string | null {
  const raw = (env.AUTH_SECRET || env.NEXTAUTH_SECRET || "").trim();
  return raw.length >= 16 ? raw : null;
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", encoder.encode(KEY_LABEL + secret));
  return crypto.subtle.importKey("raw", material, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

function isPayload(value: unknown): value is ImpersonationPayload {
  if (!value || typeof value !== "object") return false;
  const p = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" && v.length > 0 && v.length <= 64;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  return id(p.a) && id(p.t) && id(p.lid) && num(p.sv) && num(p.iat) && num(p.exp) && p.a !== p.t && (p.tr === undefined || (typeof p.tr === "string" && p.tr.length <= 20));
}

export async function signImpersonation(payload: ImpersonationPayload, secret: string): Promise<string> {
  if (!isPayload(payload)) throw new Error("Datos de vista inválidos");
  const body = b64urlFromBytes(encoder.encode(JSON.stringify(payload)));
  const data = `${VERSION}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(data)));
  return `${data}.${b64urlFromBytes(sig)}`;
}

/**
 * Verifica firma y formato. `ignoreExpiry` sirve solo para cerrar el registro
 * al salir de una vista ya vencida: nunca para dar acceso.
 */
export async function verifyImpersonation(
  token: string | null | undefined,
  secret: string | null,
  options: { now?: number; ignoreExpiry?: boolean } = {}
): Promise<VerifyResult> {
  if (!secret) return { ok: false, reason: "sin_clave" };
  if (!token || token.length > 2048) return { ok: false, reason: "formato" };
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) return { ok: false, reason: "formato" };
  const sig = bytesFromB64url(parts[2]!);
  const body = bytesFromB64url(parts[1]!);
  if (!sig || !body || sig.length !== 32) return { ok: false, reason: "formato" };
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), sig, encoder.encode(`${parts[0]}.${parts[1]}`));
  if (!valid) return { ok: false, reason: "firma" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(body));
  } catch {
    return { ok: false, reason: "formato" };
  }
  if (!isPayload(parsed)) return { ok: false, reason: "formato" };
  const now = options.now ?? Date.now();
  if (!options.ignoreExpiry && (parsed.exp <= now || parsed.iat > now + 60_000)) return { ok: false, reason: "vencida" };
  return { ok: true, payload: parsed };
}

export function newPayload(input: { adminId: string; targetId: string; sessionVersion: number; logId: string; targetRole?: string; now?: number }): ImpersonationPayload {
  const now = input.now ?? Date.now();
  const base = { a: input.adminId, t: input.targetId, sv: input.sessionVersion, lid: input.logId, iat: now, exp: now + IMPERSONATION_TTL_MS };
  return input.targetRole ? { ...base, tr: input.targetRole } : base;
}

/** Solo admins ven como otro; nunca como otro admin ni como sí mismos. */
export function canImpersonate(actor: { id: string; role: string; isActive?: boolean }, target: { id: string; role: string; isActive?: boolean }): { ok: true } | { ok: false; error: string } {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return { ok: false, error: "Solo un administrador puede ver como otro usuario." };
  if (actor.isActive === false) return { ok: false, error: "Tu usuario está desactivado." };
  if (actor.id === target.id) return { ok: false, error: "No podés verte como vos mismo." };
  if (target.role === "ADMIN" || target.role === "SUPER_ADMIN") return { ok: false, error: "No se puede ver como otro administrador." };
  if (target.isActive === false) return { ok: false, error: "El usuario está desactivado: no puede entrar, así que no hay nada que ver." };
  return { ok: true };
}

/**
 * Chequeo en cada pedido, con los datos frescos de la base: el admin real sigue
 * siendo admin, activo y con la misma versión de sesión, y el usuario visto
 * existe, está activo y no es admin.
 */
export function checkLiveImpersonation(
  payload: ImpersonationPayload,
  actor: { id: string; role: string; isActive: boolean; sessionVersion: number },
  target: { id: string; role: string; isActive: boolean } | null
): { ok: true } | { ok: false; reason: "admin" | "sesion" | "objetivo" } {
  if (actor.role !== "ADMIN" && actor.role !== "SUPER_ADMIN") return { ok: false, reason: "admin" };
  if (!actor.isActive) return { ok: false, reason: "admin" };
  if (payload.a !== actor.id) return { ok: false, reason: "sesion" };
  if (payload.sv !== actor.sessionVersion) return { ok: false, reason: "sesion" };
  if (!target || target.id !== payload.t) return { ok: false, reason: "objetivo" };
  // Si le cambiaron el tipo de usuario, la vista abierta deja de valer.
  if (payload.tr !== undefined && payload.tr !== target.role) return { ok: false, reason: "objetivo" };
  const allowed = canImpersonate(actor, target);
  if (!allowed.ok) return { ok: false, reason: "objetivo" };
  return { ok: true };
}

/** Vuelta segura dentro del sitio (evita redirecciones a otro dominio). */
export function safeReturnPath(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (value.startsWith(IMPERSONATION_EXIT_PATH) || value.startsWith(IMPERSONATION_RENEW_PATH)) return fallback;
  return value.slice(0, 512);
}
