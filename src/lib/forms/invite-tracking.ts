/**
 * Seguimiento de las invitaciones de Formularios: apertura (píxel en el mail)
 * y clic (abrir el enlace personal). Puro, para probarlo sin base.
 *
 * La apertura es aproximada: hay programas que bloquean imágenes (no se ve
 * aunque lo hayan abierto) y otros que las precargan (Apple Mail con
 * «Proteger actividad de Mail», filtros corporativos). Gmail las pide por su
 * proxy al abrir el mail, así que sí cuenta. Si abrió el enlace, abrió el mail:
 * el clic también marca la apertura.
 */
import { appUrl } from "@/lib/app-url";

/** GIF transparente de 1 × 1. */
export const TRANSPARENT_GIF = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");

export const PIXEL_HEADERS: Record<string, string> = {
  "Content-Type": "image/gif",
  "Content-Length": String(TRANSPARENT_GIF.length),
  // Sin caché: cada apertura tiene que llegar al servidor (el proxy de Gmail igual guarda una copia).
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
  "X-Robots-Tag": "noindex",
};

export function isInviteCode(code: unknown): code is string {
  return typeof code === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(code);
}

/** URL absoluta del píxel (con el dominio de producción, nunca relativa). */
export function inviteOpenPixelUrl(code: string, origin = appUrl()): string {
  return `${origin}/api/forms/open/${encodeURIComponent(code)}`;
}

type Tracked = { openedAt: Date | null; clickedAt: Date | null };

/** Cambios por una apertura del píxel. */
export function openPatch(invite: Tracked, now: Date): { openedAt?: Date; lastOpenedAt: Date; openCount: { increment: number } } {
  return { ...(invite.openedAt ? {} : { openedAt: now }), lastOpenedAt: now, openCount: { increment: 1 } };
}

/** Cambios por un clic en el enlace: si no había apertura registrada, el clic la marca. */
export function clickPatch(invite: Tracked, now: Date): { openedAt?: Date; clickedAt?: Date; clickCount: { increment: number } } {
  return { ...(invite.openedAt ? {} : { openedAt: now }), ...(invite.clickedAt ? {} : { clickedAt: now }), clickCount: { increment: 1 } };
}

export type OpenStore = {
  find(code: string): Promise<{ id: string; openedAt: Date | null; clickedAt: Date | null; sentAt: Date | null } | null>;
  update(id: string, data: ReturnType<typeof openPatch>): Promise<void>;
};

/** Anota una apertura del píxel. Solo cuenta si el mail ya salió. Devuelve si quedó anotada. */
export async function registerOpen(store: OpenStore, code: unknown, now: Date): Promise<boolean> {
  if (!isInviteCode(code)) return false;
  const invite = await store.find(code);
  if (!invite?.sentAt) return false;
  await store.update(invite.id, openPatch(invite, now));
  return true;
}

const LINK_PREVIEWERS =
  /facebookexternalhit|facebot|whatsapp|twitterbot|linkedinbot|slackbot|telegrambot|discordbot|skypeuripreview|bingpreview|googlebot|applebot|embedly|iframely|preview|crawler|spider|headlesschrome/i;

/** Vistas previas de enlaces (WhatsApp, Slack, buscadores…): no son un clic de la persona. */
export function isLinkPreviewer(userAgent: string | null | undefined): boolean {
  return Boolean(userAgent && LINK_PREVIEWERS.test(userAgent));
}
