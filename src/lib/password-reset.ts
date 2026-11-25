/**
 * «Olvidé mi clave». La lógica va acá, sin Next ni base (todo entra por
 * `deps`), para probar las reglas de seguridad:
 *
 * - Link de un solo uso que vence en 1 hora; en la base solo queda su hash.
 * - Misma respuesta exista o no el mail (y un tiempo mínimo de respuesta
 *   parejo), para no revelar quién tiene cuenta.
 * - Límite por IP y por mail (el del mail cuenta aunque no exista).
 * - Al cambiar la clave: sube sessionVersion (cierra todas las sesiones),
 *   anula otros links pendientes y avisa por mail. La verificación en dos
 *   pasos no se toca: al ingresar se sigue pidiendo el código.
 */
import { createHash, randomBytes } from "node:crypto";

export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;
export const RESET_WINDOW_MS = 60 * 60 * 1000;
export const RESET_LIMIT_PER_IP = 10;
export const RESET_LIMIT_PER_EMAIL = 3;
/** Respuesta en no menos de este tiempo, exista o no la cuenta. */
export const RESET_MIN_RESPONSE_MS = 1800;

export function createResetToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashResetToken(token) };
}

export function hashResetToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Clave del rate limit por mail: hasheada (no deja mails en claro en la tabla de límites). */
export function emailLimitKey(email: string): string {
  return `pwreset:mail:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 32)}`;
}

export type ResetTokenState = "OK" | "INVALID" | "USED" | "EXPIRED";

export function resetTokenState(row: { usedAt: Date | null; expiresAt: Date } | null, now: Date): ResetTokenState {
  if (!row) return "INVALID";
  if (row.usedAt) return "USED";
  if (row.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "OK";
}

/** Formato mínimo para un token de link (evita consultas con basura). */
export function looksLikeResetToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{40,60}$/.test(token);
}

export type ResetRequestOutcome =
  /** Siempre la misma para quien pide, haya o no cuenta. */
  | { status: "accepted" }
  /** Demasiados pedidos desde esa IP o para ese mail (no depende de que exista). */
  | { status: "limited" }
  /** No hay casilla configurada: el sistema no puede mandar mails a nadie. */
  | { status: "unavailable" };

export type ResetUser = { id: string; email: string; name: string; isActive: boolean; twoFactorEnabled: boolean };

export type RequestResetDeps = {
  channelReady(): Promise<boolean>;
  consumeLimit(key: string, limit: number, windowMs: number): Promise<{ ok: boolean }>;
  findUser(email: string): Promise<ResetUser | null>;
  /** Guarda el hash (anulando los links sin usar de ese usuario). */
  storeToken(input: { userId: string; tokenHash: string; expiresAt: Date; ipHash: string }): Promise<void>;
  sendResetMail(user: ResetUser, url: string): Promise<void>;
  baseUrl: string;
  now(): Date;
  sleep(ms: number): Promise<void>;
  minResponseMs?: number;
  /**
   * Corre lo de la cuenta real (guardar el link y mandar el mail) después de
   * responder, para que el tiempo de respuesta no delate si la cuenta existe.
   * Sin esto, se espera ahí mismo.
   */
  runInBackground?(task: () => Promise<void>): Promise<void> | null | void;
};

export async function requestPasswordResetCore(deps: RequestResetDeps, input: { email: string; ipHash: string }): Promise<ResetRequestOutcome> {
  const started = deps.now().getTime();
  const email = input.email.trim().toLowerCase();
  const finish = async <T extends ResetRequestOutcome>(outcome: T): Promise<T> => {
    const elapsed = deps.now().getTime() - started;
    const wait = (deps.minResponseMs ?? RESET_MIN_RESPONSE_MS) - elapsed;
    if (wait > 0) await deps.sleep(wait);
    return outcome;
  };

  if (!(await deps.channelReady())) return finish({ status: "unavailable" });
  const byIp = await deps.consumeLimit(`pwreset:ip:${input.ipHash}`, RESET_LIMIT_PER_IP, RESET_WINDOW_MS);
  const byMail = await deps.consumeLimit(emailLimitKey(email), RESET_LIMIT_PER_EMAIL, RESET_WINDOW_MS);
  if (!byIp.ok || !byMail.ok) return finish({ status: "limited" });

  // Un error con una cuenta real no se le muestra distinto a quien pide (no revela que existe): queda en el log y en Últimos envíos.
  const logError = (error: unknown) => console.error("[olvide-clave] no se pudo completar el pedido", error);
  try {
    const user = await deps.findUser(email);
    if (user && user.isActive) {
      const issue = async () => {
        const { token, tokenHash } = createResetToken();
        await deps.storeToken({ userId: user.id, tokenHash, expiresAt: new Date(deps.now().getTime() + PASSWORD_RESET_TTL_MS), ipHash: input.ipHash });
        await deps.sendResetMail(user, `${deps.baseUrl}/restablecer/${token}`);
      };
      if (deps.runInBackground) {
        // Si no se puede dejar corriendo (devuelve la promesa), se espera acá.
        const pending = deps.runInBackground(() => issue().catch(logError));
        if (pending) await pending;
      } else {
        await issue();
      }
    }
  } catch (error) {
    logError(error);
  }
  return finish({ status: "accepted" });
}
