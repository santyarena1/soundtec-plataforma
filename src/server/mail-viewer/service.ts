import { createHash } from "node:crypto";
import { getMailAccount, type MailAccount } from "@/lib/mail/account";
import { filtersKey, pageOfUids } from "@/lib/mail-viewer/search";
import { prepareViewerHtml } from "@/lib/mail-viewer/sanitize";
import { mergeThread, normalizeMessageId, threadLookupIds } from "@/lib/mail-viewer/thread";
import { MailboxError, type FolderInfo, type MessageDetail, type MessageFilters, type MessagePage, type MessageSummary } from "@/lib/mail-viewer/types";
import { cached, invalidate, peek, put } from "./cache";
import { createDemoProvider, demoMailboxEnabled } from "./demo-provider";
import { createImapProvider } from "./imap-provider";
import type { ParsedMessage } from "./parse";
import type { MailboxProvider } from "./provider";

/**
 * Casilla del portal para el visor: elige el proveedor (IMAP real o, en
 * desarrollo, el de ejemplo), valida carpeta y UID contra lo que hay en el
 * servidor y cachea en memoria:
 * - carpetas y contadores 60 s, listados y búsquedas 45 s, conversación 2 min
 *   («Actualizar» los descarta);
 * - cada mensaje abierto 10 min: un UID no cambia de contenido (si la carpeta
 *   cambia de UIDVALIDITY, se descarta todo lo de esa carpeta).
 */

const FOLDERS_TTL_MS = 60_000;
const LIST_TTL_MS = 45_000;
const THREAD_TTL_MS = 2 * 60_000;
const MESSAGE_TTL_MS = 10 * 60_000;
/** Datos de la cuenta (lectura de Configuración): cambian muy rara vez. */
const ACCOUNT_TTL_MS = 60_000;
export const PAGE_SIZE = 50;

/** Alias de carpetas en los enlaces (el nombre real depende del servidor). */
const ALIASES: Record<string, string> = { __inbox: "\\Inbox", __sent: "\\Sent", __junk: "\\Junk", __trash: "\\Trash" };

/**
 * Solo en desarrollo: IMAP simulado (sin TLS) para medir con latencia, p. ej.
 * MAIL_VIEWER_IMAP_SIM=127.0.0.1:11431 (usuario testuser / testpass).
 */
function simulatedAccount(): MailAccount | null {
  const sim = process.env.MAIL_VIEWER_IMAP_SIM;
  if (!sim || process.env.NODE_ENV === "production") return null;
  const [host, port] = sim.split(":");
  return { host: host || "127.0.0.1", imapPort: Number(port) || 143, user: "testuser", password: "testpass", fromName: "Simulada", smtpPort: 465 };
}

type ProviderCache = { __mailViewerProviders?: Map<string, MailboxProvider> };
const providers = ((globalThis as unknown as ProviderCache).__mailViewerProviders ??= new Map());

function imapProviderFor(account: MailAccount): MailboxProvider {
  const id = `${account.user}@${account.host}:${account.imapPort}:${createHash("sha256").update(account.password).digest("hex").slice(0, 16)}`;
  let provider = providers.get(id);
  if (!provider) {
    for (const key of providers.keys()) if (key.startsWith(`${account.user}@${account.host}:${account.imapPort}:`)) providers.delete(key);
    const created: MailboxProvider = createImapProvider(account, {
      onUidValidityChange: (folder) => {
        invalidate(`${created.accountKey}:msg:${folder}:`);
        invalidate(`${created.accountKey}:list:${folder}:`);
        invalidate(`${created.accountKey}:head:${folder}:`);
      },
    });
    provider = created;
    providers.set(id, provider);
  }
  return provider;
}

export async function getMailbox(): Promise<{ provider: MailboxProvider; demo: boolean }> {
  if (demoMailboxEnabled()) return { provider: createDemoProvider(), demo: true };
  const account = simulatedAccount() ?? (await cached("account", ACCOUNT_TTL_MS, () => getMailAccount().catch(() => null)));
  if (!account) throw new MailboxError("Falta configurar la casilla (usuario y contraseña) en Configuración › Correo.", "no_account");
  return { provider: imapProviderFor(account), demo: false };
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

/**
 * Ruta de la carpeta sin esperar la lista de carpetas cuando se puede: sin
 * carpeta (o «Recibidos») es INBOX, que en IMAP siempre existe con ese nombre.
 * Así el listado arranca a la par de los contadores.
 */
export function quickFolderPath(requested: string | undefined | null): string | null {
  if (!requested || requested === "__inbox" || requested.toUpperCase() === "INBOX") return "INBOX";
  return ALIASES[requested] ? null : requested;
}

/** La carpeta tiene que existir tal cual (para rutas de adjuntos y acciones). */
export async function requireFolder(provider: MailboxProvider, path: string): Promise<FolderInfo> {
  const folders = await loadFolders(provider);
  const folder = folders.find((f) => f.path === path);
  if (!folder) throw new MailboxError("Esa carpeta no existe en la casilla.", "invalid");
  return folder;
}

function hasFilters(filters: MessageFilters): boolean {
  return Boolean(filters.q || filters.from || filters.to || filters.unread);
}

export async function listMessages(provider: MailboxProvider, folder: string, filters: MessageFilters, page: number, pageSize = PAGE_SIZE): Promise<MessagePage> {
  const prefix = `${provider.accountKey}:list:${folder}:`;
  // Lo más común (entrar, cambiar de carpeta): los más nuevos, sin SEARCH.
  if (page <= 1 && !hasFilters(filters) && provider.latestPage) {
    const latest = await cached(`${prefix}latest:${pageSize}`, LIST_TTL_MS, () => provider.latestPage!(folder, pageSize));
    return { folder, total: latest.total, page: 1, pageSize, messages: latest.messages };
  }
  const uids = await cached(`${prefix}${filtersKey(filters)}`, LIST_TTL_MS, () => provider.searchUids(folder, filters));
  const slice = pageOfUids(uids, page, pageSize);
  const messages = slice.slice.length ? await cached(`${prefix}page:${slice.slice.join(",")}`, LIST_TTL_MS, () => provider.summaries(folder, slice.slice)) : [];
  return { folder, total: slice.total, page: slice.page, pageSize, messages };
}

function messageKey(provider: MailboxProvider, folder: string, uid: number): string {
  return `${provider.accountKey}:msg:${folder}:${uid}`;
}

function messageBytes(message: ParsedMessage): number {
  let bytes = 4096 + (message.html?.length ?? 0) * 2 + message.detail.text.length * 2;
  for (const uri of message.inlineImages.values()) bytes += uri.length;
  return bytes;
}

export function openMessage(provider: MailboxProvider, folder: string, uid: number): Promise<ParsedMessage> {
  return cached(messageKey(provider, folder, uid), MESSAGE_TTL_MS, () => provider.getMessage(folder, uid), messageBytes);
}

/** ¿Ya está en memoria? (para no mostrar esqueleto si no hace falta). */
export function isMessageCached(provider: MailboxProvider, folder: string, uid: number): boolean {
  return peek<ParsedMessage>(messageKey(provider, folder, uid)) !== undefined;
}

// HTML saneado por mensaje: la página cuenta imágenes bloqueadas y el iframe lo sirve; se hace una vez.
const prepared = new WeakMap<ParsedMessage, Map<boolean, ReturnType<typeof prepareViewerHtml>>>();
export function preparedHtml(message: ParsedMessage, allowRemoteImages: boolean): ReturnType<typeof prepareViewerHtml> | null {
  if (!message.html) return null;
  let byMode = prepared.get(message);
  if (!byMode) prepared.set(message, (byMode = new Map()));
  let result = byMode.get(allowRemoteImages);
  if (!result) byMode.set(allowRemoteImages, (result = prepareViewerHtml(message.html, { allowRemoteImages, inlineImages: message.inlineImages })));
  return result;
}

/** Conversación: este mensaje y los relacionados en su carpeta, Recibidos y Enviados. */
export async function loadThread(provider: MailboxProvider, folders: FolderInfo[], detail: MessageDetail): Promise<MessageSummary[]> {
  const ids = threadLookupIds(detail);
  const ownId = normalizeMessageId(detail.messageId);
  if (!ids.length && !ownId) return [];
  const where = [...new Set([detail.folder, ...folders.filter((f) => f.specialUse === "\\Inbox" || f.specialUse === "\\Sent").map((f) => f.path)])];
  const found = await cached(`${provider.accountKey}:thread:${detail.folder}:${detail.uid}`, THREAD_TTL_MS, () => provider.findThread(where, ids, ownId)).catch(() => []);
  const all = mergeThread([detail, ...found]);
  return all.length > 1 ? all : [];
}

/** Descarta carpetas, listados y conversaciones (no los mensajes: no cambian). */
export function invalidateListings(provider: MailboxProvider): void {
  invalidate(`${provider.accountKey}:folders`);
  invalidate(`${provider.accountKey}:list:`);
  invalidate(`${provider.accountKey}:thread:`);
  invalidate(`${provider.accountKey}:activity:`);
}

export async function setSeen(provider: MailboxProvider, folder: string, uid: number, seen: boolean): Promise<void> {
  await provider.setSeen(folder, uid, seen);
  invalidateListings(provider);
  const key = messageKey(provider, folder, uid);
  const message = peek<ParsedMessage>(key);
  if (message) {
    const updated: ParsedMessage = { ...message, detail: { ...message.detail, seen } };
    put(key, MESSAGE_TTL_MS, updated, messageBytes(updated));
  }
}

/** Últimos mensajes de una carpeta desde una fecha (para «Actividad»). */
export async function recentMessages(provider: MailboxProvider, folder: string, sinceYmd: string, limit: number): Promise<MessageSummary[]> {
  const filters: MessageFilters = { q: "", field: "all", from: sinceYmd, to: null, unread: false };
  const page = await listMessages(provider, folder, filters, 1, limit);
  return page.messages;
}
