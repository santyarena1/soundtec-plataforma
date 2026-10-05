import { createHash, randomBytes } from "node:crypto";

export const ACTIVATION_TTL_MS = 72 * 3600 * 1000;

/** Token en claro (va en el link) y su hash (lo único que se guarda). */
export function createActivationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, tokenHash: hashActivationToken(token) };
}

export function hashActivationToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
