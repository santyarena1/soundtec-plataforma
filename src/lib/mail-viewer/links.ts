import { APP_TIME_ZONE } from "@/lib/utils";
import type { MailAddress, MessageFilters } from "./types";

/** Enlaces y textos cortos del visor. Puro. */

export const VIEWER_PATH = "/admin/correo";

export type ViewerState = { folder: string; filters: MessageFilters; page: number; uid?: number | null };

/** URL de la bandeja conservando carpeta, búsqueda y página; `patch` pisa lo que cambie. */
export function viewerHref(state: ViewerState, patch: Partial<{ folder: string; page: number; uid: number | null; filters: Partial<MessageFilters> }> = {}): string {
  const folder = patch.folder ?? state.folder;
  const filters = { ...state.filters, ...(patch.filters ?? {}) };
  const page = patch.page ?? state.page;
  const uid = patch.uid === undefined ? state.uid : patch.uid;
  const params = new URLSearchParams();
  params.set("carpeta", folder);
  if (filters.q) params.set("q", filters.q);
  if (filters.q && filters.field !== "all") params.set("campo", filters.field);
  if (filters.from) params.set("desde", filters.from);
  if (filters.to) params.set("hasta", filters.to);
  if (filters.unread) params.set("noLeidos", "1");
  if (page > 1) params.set("pagina", String(page));
  if (uid) params.set("uid", String(uid));
  return `${VIEWER_PATH}?${params}`;
}

export function attachmentHref(folder: string, uid: number, part: string): string {
  return `/api/admin/correo/adjunto?${new URLSearchParams({ carpeta: folder, uid: String(uid), parte: part })}`;
}

export function bodyHref(folder: string, uid: number, images: boolean): string {
  const params = new URLSearchParams({ carpeta: folder, uid: String(uid) });
  if (images) params.set("imagenes", "1");
  return `/api/admin/correo/cuerpo?${params}`;
}

export function addressText(a: MailAddress | null | undefined): string {
  if (!a) return "(sin remitente)";
  return a.name ? `${a.name} <${a.address}>` : a.address;
}

export function shortAddress(a: MailAddress | null | undefined): string {
  if (!a) return "(sin remitente)";
  return a.name || a.address;
}

/** Hoy: «14:32»; este año: «21 nov»; antes: «21/11/25». */
export function listDate(iso: string | null, now = new Date()): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const day = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: APP_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
  if (day(date) === day(now)) return new Intl.DateTimeFormat("es-AR", { timeZone: APP_TIME_ZONE, hour: "2-digit", minute: "2-digit" }).format(date);
  const year = (d: Date) => new Intl.DateTimeFormat("es-AR", { timeZone: APP_TIME_ZONE, year: "numeric" }).format(d);
  if (year(date) === year(now)) return new Intl.DateTimeFormat("es-AR", { timeZone: APP_TIME_ZONE, day: "numeric", month: "short" }).format(date).replace(".", "");
  return new Intl.DateTimeFormat("es-AR", { timeZone: APP_TIME_ZONE, day: "2-digit", month: "2-digit", year: "2-digit" }).format(date);
}
