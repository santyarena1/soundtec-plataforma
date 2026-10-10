/**
 * Tokens de integración: un admin genera desde su sesión un token temporal
 * para que un proceso externo (scripts de carga, Claude) use un endpoint
 * puntual sin sesión de navegador. Se guarda solo el hash, con vencimiento,
 * y cada token sirve para un único alcance.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { getSetting, setSetting } from "@/lib/settings";

export const INTEGRATION_SCOPES = ["catalog-io"] as const;
export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];

const MAX_DAYS = 14;
const DAY_MS = 86_400_000;
const keyOf = (scope: IntegrationScope) => `integration.${scope}.token`;
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");

/** Emite un token nuevo (reemplaza al anterior del mismo alcance) y lo devuelve una sola vez. */
export async function issueIntegrationToken(scope: IntegrationScope, days: number, issuedBy: string): Promise<{ token: string; expiresAt: string }> {
  const token = `stk_${scope}_${randomBytes(32).toString("hex")}`;
  const expiresAt = new Date(Date.now() + Math.min(MAX_DAYS, Math.max(1, days)) * DAY_MS).toISOString();
  await setSetting(keyOf(scope), JSON.stringify({ hash: hashOf(token), expiresAt, issuedBy }), { isSecret: true, description: `Token de integración (${scope})` });
  return { token, expiresAt };
}

export async function revokeIntegrationToken(scope: IntegrationScope) {
  await setSetting(keyOf(scope), "", { isSecret: true });
}

/** true si el pedido trae "Authorization: Bearer <token>" vigente para ese alcance. */
export async function hasIntegrationToken(req: Request, scope: IntegrationScope): Promise<boolean> {
  const token = /^Bearer\s+(\S+)$/i.exec(req.headers.get("authorization") ?? "")?.[1];
  if (!token) return false;
  const raw = await getSetting(keyOf(scope), "");
  if (!raw) return false;
  try {
    const { hash, expiresAt } = JSON.parse(raw) as { hash?: string; expiresAt?: string };
    if (!hash || !expiresAt || Date.parse(expiresAt) < Date.now()) return false;
    const a = Buffer.from(hashOf(token), "hex");
    const b = Buffer.from(hash, "hex");
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
