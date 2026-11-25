import { createHash } from "node:crypto";
import type { FetchMessageObject, ImapFlow, SearchObject } from "imapflow";
import { createImap, type MailAccount } from "@/lib/mail/account";
import { collectAttachments, type StructureNode } from "@/lib/mail-viewer/attachments";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { folderLabel, resolveSpecialUse, sortFolders } from "@/lib/mail-viewer/folders";
import { buildImapSearch } from "@/lib/mail-viewer/search";
import { MailboxError, type FolderInfo, type MessageFilters, type MessageSummary } from "@/lib/mail-viewer/types";
import { peek, put } from "./cache";
import { ImapPool, isConnectionError } from "./imap-pool";
import { buildDisplayMessage, displayParts, findPart, FULL_FETCH_MAX_BYTES, headerLinesOf, type FetchedPart } from "./mime-parts";
import { MAX_FULL_MESSAGE_BYTES, PARTIAL_SOURCE_BYTES, parseMessage, summaryFromFetch, type FetchedLike } from "./parse";
import type { MailboxProvider } from "./provider";

/** Tope de una operación (pedir y leer; la conexión ya suele estar abierta). */
const OPERATION_TIMEOUT_MS = 20_000;
/** Conexiones abiertas por instancia del servidor (InMotion permite ~20 por IP). */
const POOL_MAX = 3;
/** Sin uso durante este tiempo, la conexión se cierra (LOGOUT). */
const POOL_IDLE_MS = 3 * 60_000;
/** Adjuntos: hasta 50 MB por descarga, en tramos grandes (menos idas y vueltas). */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const DOWNLOAD_CHUNK_BYTES = 1024 * 1024;
const SUMMARY_QUERY = { uid: true, envelope: true, flags: true, bodyStructure: true, size: true, internalDate: true } as const;
const MAX_THREAD_RESULTS = 20;
/** Estructura y tamaño de cada mensaje listado: al abrirlo ya se sabe qué partes pedir. */
const HEAD_TTL_MS = 15 * 60_000;

type Head = { size: number; bodyStructure: StructureNode | undefined };

function toFetched(msg: Pick<FetchMessageObject, "uid" | "flags" | "size" | "internalDate" | "envelope" | "bodyStructure">): FetchedLike {
  return { uid: msg.uid, flags: msg.flags, size: msg.size, internalDate: msg.internalDate, envelope: msg.envelope as FetchedLike["envelope"], bodyStructure: msg.bodyStructure as StructureNode | undefined };
}

/**
 * imapflow manda ID antes y (con Dovecot, que contesta solo «name») otra vez
 * después del LOGIN: dos idas y vueltas que el visor no necesita (ID es
 * opcional, RFC 2971). Si la versión de imapflow cambia y `run` no existe, no
 * hace nada.
 */
function skipIdCommand(client: ImapFlow): void {
  const target = client as unknown as { run?: (command: string, ...args: unknown[]) => Promise<unknown> };
  const original = target.run;
  if (typeof original !== "function") return;
  target.run = function (command: string, ...args: unknown[]) {
    if (String(command).toUpperCase() === "ID") return Promise.resolve({ client: "visor", skipped: "true" });
    return original.call(this, command, ...args);
  };
}

// Un pool por casilla y contraseña, compartido por todos los pedidos de esta instancia.
const pools = ((globalThis as unknown as { __mailViewerPools?: Map<string, ImapPool<ImapFlow>> }).__mailViewerPools ??= new Map());

function poolFor(account: MailAccount, key: string): ImapPool<ImapFlow> {
  const id = `${key}#${createHash("sha256").update(account.password).digest("hex").slice(0, 16)}`;
  let pool = pools.get(id);
  if (pool) return pool;
  // Si cambió la contraseña, el pool viejo se cierra.
  for (const [other, old] of pools) {
    if (other.startsWith(`${key}#`)) {
      old.close();
      pools.delete(other);
    }
  }
  pool = new ImapPool<ImapFlow>({
    max: POOL_MAX,
    idleMs: POOL_IDLE_MS,
    operationTimeoutMs: OPERATION_TIMEOUT_MS,
    create: () => {
      const client = createImap(account, {
        // Menos idas y vueltas al entrar: sin COMPRESS ni ENABLE (el visor no los usa).
        disableCompression: true,
        disableAutoEnable: true,
        // Sin IDLE automático: cortarlo antes de cada comando cuesta otra ida y vuelta.
        disableAutoIdle: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: POOL_IDLE_MS + 60_000,
      });
      // Sin esto, un error de socket con la conexión libre tira el proceso.
      client.on("error", () => undefined);
      skipIdCommand(client);
      return client;
    },
  });
  pools.set(id, pool);
  return pool;
}

export function createImapProvider(account: MailAccount, hooks: { onUidValidityChange?: (folder: string) => void } = {}): MailboxProvider {
  const own = account.user.toLowerCase();
  const accountKey = `${account.user.toLowerCase()}@${account.host.toLowerCase()}:${account.imapPort}`;
  const pool = poolFor(account, accountKey);
  const uidValidity = new Map<string, string>();
  /** Lo último que devolvió LIST: se le pasa a cada conexión para que EXAMINE no repita el LIST. */
  let listed = new Map<string, unknown>();
  const headKey = (folder: string, uid: number) => `${accountKey}:head:${folder}:${uid}`;

  async function run<T>(op: (client: ImapFlow) => Promise<T>): Promise<T> {
    try {
      return await pool.run(op);
    } catch (error) {
      throw toMailboxError(error);
    }
  }

  /** Abre la carpeta en solo lectura (EXAMINE) si no estaba ya abierta en esa conexión. */
  async function inFolder<T>(client: ImapFlow, folder: string, op: () => Promise<T>, readOnly = true): Promise<T> {
    const folderCache = (client as unknown as { folders?: unknown }).folders;
    if (folderCache instanceof Map && !folderCache.has(folder) && listed.has(folder)) folderCache.set(folder, listed.get(folder));
    const lock = await client.getMailboxLock(folder, { readOnly });
    try {
      const validity = client.mailbox ? String(client.mailbox.uidValidity) : "";
      const known = uidValidity.get(folder);
      if (validity && known && known !== validity) hooks.onUidValidityChange?.(folder);
      if (validity) uidValidity.set(folder, validity);
      return await op();
    } finally {
      lock.release();
    }
  }

  function remember(folder: string, rows: FetchMessageObject[]): void {
    for (const row of rows) put<Head>(headKey(folder, row.uid), HEAD_TTL_MS, { size: row.size ?? 0, bodyStructure: row.bodyStructure as StructureNode | undefined }, 2048);
  }

  async function summariesIn(client: ImapFlow, folder: string, uids: number[]): Promise<MessageSummary[]> {
    if (!uids.length) return [];
    const rows = await client.fetchAll(uids.join(","), SUMMARY_QUERY, { uid: true });
    remember(folder, rows);
    return rows.map((row) => summaryFromFetch(toFetched(row), folder)).sort((a, b) => b.uid - a.uid);
  }

  /** Mensaje para mostrar: entero si es chico; si no, solo texto, HTML e imágenes del cuerpo. */
  async function readMessage(client: ImapFlow, folder: string, uid: number) {
    let head = peek<Head>(headKey(folder, uid));
    if (!head) {
      // Sin datos del listado: en la misma ida y vuelta se trae el principio del fuente,
      // que para la mayoría de los mails ya es el mensaje completo.
      const msg = await client.fetchOne(String(uid), { ...SUMMARY_QUERY, source: { maxLength: FULL_FETCH_MAX_BYTES } }, { uid: true });
      if (!msg) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
      head = { size: msg.size ?? 0, bodyStructure: msg.bodyStructure as StructureNode | undefined };
      put<Head>(headKey(folder, uid), HEAD_TTL_MS, head, 2048);
      if (msg.source && head.size <= FULL_FETCH_MAX_BYTES) return parseMessage(msg.source, toFetched(msg), folder, { tooLarge: false, ownAddresses: [own] });
    }
    const parts = head.size > FULL_FETCH_MAX_BYTES ? displayParts(head.bodyStructure) : null;
    if (!parts) {
      const tooLarge = head.size > MAX_FULL_MESSAGE_BYTES;
      const msg = await client.fetchOne(String(uid), { ...SUMMARY_QUERY, source: tooLarge ? { maxLength: PARTIAL_SOURCE_BYTES } : true }, { uid: true });
      if (!msg || !msg.source) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
      return parseMessage(msg.source, toFetched(msg), folder, { tooLarge, ownAddresses: [own] });
    }
    const wanted = [...parts.text, ...parts.images, ...parts.reports];
    const msg = await client.fetchOne(String(uid), { ...SUMMARY_QUERY, headers: true, bodyParts: wanted.flatMap((p) => [`${p}.MIME`, p]) }, { uid: true });
    if (!msg || !msg.headers) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
    const structure = msg.bodyStructure as StructureNode | undefined;
    const pick = (part: string): FetchedPart => ({
      part,
      type: findPart(structure, part)?.type ?? "text/plain",
      mime: msg.bodyParts?.get(`${part}.mime`),
      body: msg.bodyParts?.get(part),
    });
    const source = buildDisplayMessage(msg.headers, parts.text.map(pick), [...parts.images, ...parts.reports].map(pick));
    return parseMessage(source, toFetched(msg), folder, { tooLarge: false, ownAddresses: [own], headerLines: headerLinesOf(msg.headers.toString("latin1")) });
  }

  return {
    accountKey,
    ownAddress: own,

    warm: () => pool.warm(),

    listFolders: () =>
      run(async (client) => {
        const list = await client.list({ statusQuery: { messages: true, unseen: true } });
        listed = new Map(list.map((f) => [f.path, f]));
        const folders: FolderInfo[] = list
          .filter((f) => !f.flags.has("\\Noselect") && !f.flags.has("\\NonExistent"))
          .map((f) => {
            const specialUse = resolveSpecialUse(f.path, f.specialUse, f.delimiter);
            return { path: f.path, label: folderLabel(f.path, specialUse, f.delimiter), specialUse, total: f.status?.messages ?? null, unseen: f.status?.unseen ?? null };
          });
        return sortFolders(folders);
      }),

    searchUids: (folder: string, filters: MessageFilters) =>
      run((client) =>
        inFolder(client, folder, async () => {
          const result = await client.search(buildImapSearch(filters) as SearchObject, { uid: true });
          return Array.isArray(result) ? result : [];
        })
      ),

    summaries: (folder: string, uids: number[]) => run((client) => inFolder(client, folder, () => summariesIn(client, folder, uids))),

    latestPage: (folder: string, pageSize: number) =>
      run((client) =>
        inFolder(client, folder, async () => {
          const fetchNewest = async () => {
            const exists = client.mailbox ? client.mailbox.exists : 0;
            if (!exists) return [];
            // «n:*» incluye lo que haya llegado desde el último comando en esta conexión.
            return client.fetchAll(`${Math.max(1, exists - pageSize + 1)}:*`, SUMMARY_QUERY);
          };
          let rows = await fetchNewest();
          const exists = client.mailbox ? client.mailbox.exists : 0;
          if (rows.length < Math.min(pageSize, exists)) {
            // Se borraron mensajes desde la última vez: NOOP actualiza la cuenta y se repite.
            await client.noop();
            rows = await fetchNewest();
          }
          remember(folder, rows);
          const messages = rows
            .map((row) => summaryFromFetch(toFetched(row), folder))
            .sort((a, b) => b.uid - a.uid)
            .slice(0, pageSize);
          return { total: client.mailbox ? client.mailbox.exists : messages.length, messages };
        })
      ),

    getMessage: (folder: string, uid: number) => run((client) => inFolder(client, folder, () => readMessage(client, folder, uid))),

    findThread: async (folders: string[], ids: string[], ownId: string | null) => {
      const conditions: SearchObject[] = ids.map((id) => ({ header: { "message-id": id } }));
      if (ownId) conditions.push({ header: { "in-reply-to": ownId } }, { header: { references: ownId } });
      if (!conditions.length) return [];
      const search: SearchObject = conditions.length === 1 ? conditions[0]! : { or: conditions };
      // Una carpeta por conexión, en paralelo.
      const found = await Promise.all(
        folders.map((folder) =>
          run((client) =>
            inFolder(client, folder, async () => {
              const uids = await client.search(search, { uid: true });
              const list = Array.isArray(uids) ? uids.slice(-MAX_THREAD_RESULTS) : [];
              return summariesIn(client, folder, list);
            })
          ).catch((error) => {
            console.warn("[correo] no se pudo buscar la conversación en", folder, error instanceof Error ? error.message : error);
            return [] as MessageSummary[];
          })
        )
      );
      return found.flat();
    },

    async openAttachment(folder: string, uid: number, part: string) {
      let lease: Awaited<ReturnType<typeof pool.acquire>>;
      try {
        lease = await pool.acquire();
      } catch (error) {
        throw toMailboxError(error);
      }
      const { client } = lease;
      let lock: { release(): void } | null = null;
      let finished = false;
      const finish = (healthy: boolean) => {
        if (finished) return;
        finished = true;
        lock?.release();
        lease.release(healthy);
      };
      try {
        lock = await client.getMailboxLock(folder, { readOnly: true });
        let structure = peek<Head>(headKey(folder, uid))?.bodyStructure;
        if (!structure) {
          const head = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true });
          structure = head ? (head.bodyStructure as StructureNode) : undefined;
        }
        const attachment = structure ? collectAttachments(structure).find((a) => a.part === part) : undefined;
        if (!attachment) throw new MailboxError("Ese adjunto ya no está en el mensaje.", "not_found");
        const download = await client.download(String(uid), part, { uid: true, maxBytes: MAX_DOWNLOAD_BYTES, chunkSize: DOWNLOAD_CHUNK_BYTES });
        if (!download.content) throw new MailboxError("Ese adjunto ya no está en el mensaje.", "not_found");
        const content = download.content;
        const iterator = content[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const { value, done } = await iterator.next();
              if (done) {
                controller.close();
                finish(true);
                return;
              }
              controller.enqueue(new Uint8Array(value));
            } catch (error) {
              controller.error(error);
              finish(false);
            }
          },
          cancel() {
            content.destroy();
            // La descarga quedó a mitad de camino: esa conexión no se reusa.
            finish(false);
          },
        });
        return { stream, filename: attachment.filename, contentType: attachment.contentType, size: attachment.size };
      } catch (error) {
        finish(!isConnectionError(error) && client.usable);
        throw toMailboxError(error);
      }
    },

    setSeen: (folder: string, uid: number, seen: boolean) =>
      run((client) =>
        inFolder(
          client,
          folder,
          async () => {
            if (seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
            else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
          },
          false
        )
      ),
  };
}
