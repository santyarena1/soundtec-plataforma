import { getMailAccount } from "@/lib/mail/account";
import { filtersKey, pageOfUids } from "@/lib/mail-viewer/search";
import { mergeThread, normalizeMessageId, threadLookupIds } from "@/lib/mail-viewer/thread";
import { MailboxError, type FolderInfo, type MessageDetail, type MessageFilters, type MessagePage, type MessageSummary } from "@/lib/mail-viewer/types";
import { cached, invalidate } from "./cache";
import { createDemoProvider, demoMailboxEnabled } from "./demo-provider";
import { createImapProvider } from "./imap-provider";
import type { ParsedMessage } from "./parse";
import type { MailboxProvider } from "./provider";

/**
 * Casilla del portal para el visor: elige el proveedor (IMAP real o, en
 * desarrollo, el de ejemplo), valida carpeta y UID contra lo que hay en el
 * servidor y cachea un rato los listados.
 */

const FOLDERS_TTL_MS = 60_000;
const LIST_TTL_MS = 45_000;
const MESSAGE_TTL_MS = 60_000;
export const PAGE_SIZE = 50;

/** Alias de carpetas en los enlaces (el nombre real depende del servidor). */
const ALIASES: Record<string, string> = { __inbox: "\\Inbox", __sent: "\\Sent", __junk: "\\Junk", __trash: "\\Trash" };

export async function getMailbox(): Promise<{ provider: MailboxProvider; demo: boolean }> {
  if (demoMailboxEnabled()) return { provider: createDemoProvider(), demo: true };
  const account = await getMailAccount().catch(() => null);
  if (!account) throw new MailboxError("Falta configurar la casilla (usuario y contraseña) en Configuración › Correo.", "no_account");
  return { provider: createImapProvider(account), demo: false };
}

export function loadFolders(provider: MailboxProvider): Promise<FolderInfo[]> {
  return cached(`${provider.accountKey}:folders`, FOLDERS_TTL_MS, () => provider.listFolders());
}

/** Carpeta pedida si existe en la casilla; si no, Recibidos. */
export function resolveFolder(folders: FolderInfo[], requested: string | undefined | null): FolderInfo | null {
  const special = requested ? ALIASES[requested] : undefined;
  const found = special ? folders.find((f) => f.specialUse === special) : requested ? folders.find((f) => f.path === requested) : undefined;
  return found ?? folders.find((f) => f.specialUse === "\\Inbox") ?? folders[0] ?? null;
}

/** La carpeta tiene que existir tal cual (para rutas de adjuntos y acciones). */
export async function requireFolder(provider: MailboxProvider, path: string): Promise<FolderInfo> {
  const folders = await loadFolders(provider);
  const folder = folders.find((f) => f.path === path);
  if (!folder) throw new MailboxError("Esa carpeta no existe en la casilla.", "invalid");
  return folder;
}

export async function listMessages(provider: MailboxProvider, folder: string, filters: MessageFilters, page: number, pageSize = PAGE_SIZE): Promise<MessagePage> {
  const prefix = `${provider.accountKey}:list:${folder}:`;
  const uids = await cached(`${prefix}${filtersKey(filters)}`, LIST_TTL_MS, () => provider.searchUids(folder, filters));
  const slice = pageOfUids(uids, page, pageSize);
  const messages = slice.slice.length ? await cached(`${prefix}page:${slice.slice.join(",")}`, LIST_TTL_MS, () => provider.summaries(folder, slice.slice)) : [];
  return { folder, total: slice.total, page: slice.page, pageSize, messages };
}

export function openMessage(provider: MailboxProvider, folder: string, uid: number): Promise<ParsedMessage> {
  return cached(`${provider.accountKey}:msg:${folder}:${uid}`, MESSAGE_TTL_MS, () => provider.getMessage(folder, uid));
}

/** Conversación: este mensaje y los relacionados en su carpeta, Recibidos y Enviados. */
export async function loadThread(provider: MailboxProvider, folders: FolderInfo[], detail: MessageDetail): Promise<MessageSummary[]> {
  const ids = threadLookupIds(detail);
  const ownId = normalizeMessageId(detail.messageId);
  if (!ids.length && !ownId) return [];
  const where = [...new Set([detail.folder, ...folders.filter((f) => f.specialUse === "\\Inbox" || f.specialUse === "\\Sent").map((f) => f.path)])];
  const found = await cached(`${provider.accountKey}:thread:${detail.folder}:${detail.uid}`, MESSAGE_TTL_MS, () => provider.findThread(where, ids, ownId)).catch(() => []);
  const all = mergeThread([detail, ...found]);
  return all.length > 1 ? all : [];
}

export async function setSeen(provider: MailboxProvider, folder: string, uid: number, seen: boolean): Promise<void> {
  await provider.setSeen(folder, uid, seen);
  invalidate(`${provider.accountKey}:`);
}

/** Últimos mensajes de una carpeta desde una fecha (para «Actividad»). */
export async function recentMessages(provider: MailboxProvider, folder: string, sinceYmd: string, limit: number): Promise<MessageSummary[]> {
  const filters: MessageFilters = { q: "", field: "all", from: sinceYmd, to: null, unread: false };
  const page = await listMessages(provider, folder, filters, 1, limit);
  return page.messages;
}
