import type { ImapFlow, SearchObject } from "imapflow";
import { createImap, type MailAccount } from "@/lib/mail/account";
import { collectAttachments, type StructureNode } from "@/lib/mail-viewer/attachments";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { folderLabel, resolveSpecialUse, sortFolders } from "@/lib/mail-viewer/folders";
import { buildImapSearch } from "@/lib/mail-viewer/search";
import { MailboxError, type FolderInfo, type MessageFilters, type MessageSummary } from "@/lib/mail-viewer/types";
import { MAX_FULL_MESSAGE_BYTES, PARTIAL_SOURCE_BYTES, parseMessage, summaryFromFetch, type FetchedLike } from "./parse";
import type { MailboxProvider } from "./provider";

/** Tope de una operación completa (conectar + leer). */
const OPERATION_TIMEOUT_MS = 20_000;
/** Adjuntos: hasta 50 MB por descarga. */
const MAX_DOWNLOAD_BYTES = 50 * 1024 * 1024;
const SUMMARY_QUERY = { uid: true, envelope: true, flags: true, bodyStructure: true, size: true, internalDate: true } as const;
const MAX_THREAD_RESULTS = 20;

async function withClient<T>(account: MailAccount, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = createImap(account);
  // Sin esto, un error de socket después de conectar tira el proceso.
  client.on("error", () => undefined);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    client.close();
  }, OPERATION_TIMEOUT_MS);
  try {
    await client.connect();
    const result = await run(client);
    await client.logout().catch(() => client.close());
    return result;
  } catch (error) {
    client.close();
    if (timedOut) throw new MailboxError("La casilla tardó demasiado en responder. Probá de nuevo en un rato.", "timeout");
    throw toMailboxError(error);
  } finally {
    clearTimeout(timer);
  }
}

async function readOnly<T>(client: ImapFlow, folder: string, run: () => Promise<T>): Promise<T> {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    return await run();
  } finally {
    lock.release();
  }
}

function toFetched(msg: { uid: number; flags?: Set<string>; size?: number; internalDate?: Date | string; envelope?: unknown; bodyStructure?: unknown }): FetchedLike {
  return { uid: msg.uid, flags: msg.flags, size: msg.size, internalDate: msg.internalDate, envelope: msg.envelope as FetchedLike["envelope"], bodyStructure: msg.bodyStructure as StructureNode | undefined };
}

export function createImapProvider(account: MailAccount): MailboxProvider {
  const own = account.user.toLowerCase();

  async function summariesIn(client: ImapFlow, folder: string, uids: number[]): Promise<MessageSummary[]> {
    if (!uids.length) return [];
    const rows = await client.fetchAll(uids.join(","), SUMMARY_QUERY, { uid: true });
    return rows.map((row) => summaryFromFetch(toFetched(row), folder)).sort((a, b) => b.uid - a.uid);
  }

  return {
    accountKey: `${account.user.toLowerCase()}@${account.host.toLowerCase()}:${account.imapPort}`,
    ownAddress: own,

    listFolders: () =>
      withClient(account, async (client) => {
        const list = await client.list({ statusQuery: { messages: true, unseen: true } });
        const folders: FolderInfo[] = list
          .filter((f) => !f.flags.has("\\Noselect") && !f.flags.has("\\NonExistent"))
          .map((f) => {
            const specialUse = resolveSpecialUse(f.path, f.specialUse, f.delimiter);
            return { path: f.path, label: folderLabel(f.path, specialUse, f.delimiter), specialUse, total: f.status?.messages ?? null, unseen: f.status?.unseen ?? null };
          });
        return sortFolders(folders);
      }),

    searchUids: (folder: string, filters: MessageFilters) =>
      withClient(account, (client) =>
        readOnly(client, folder, async () => {
          const result = await client.search(buildImapSearch(filters) as SearchObject, { uid: true });
          return Array.isArray(result) ? result : [];
        })
      ),

    summaries: (folder: string, uids: number[]) => withClient(account, (client) => readOnly(client, folder, () => summariesIn(client, folder, uids))),

    getMessage: (folder: string, uid: number) =>
      withClient(account, (client) =>
        readOnly(client, folder, async () => {
          const head = await client.fetchOne(String(uid), { uid: true, size: true, bodyStructure: true }, { uid: true });
          if (!head) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
          const tooLarge = (head.size ?? 0) > MAX_FULL_MESSAGE_BYTES;
          const msg = await client.fetchOne(String(uid), { ...SUMMARY_QUERY, source: tooLarge ? { maxLength: PARTIAL_SOURCE_BYTES } : true }, { uid: true });
          if (!msg || !msg.source) throw new MailboxError("Ese mensaje ya no está en la casilla.", "not_found");
          return parseMessage(msg.source, toFetched(msg), folder, { tooLarge, ownAddresses: [own] });
        })
      ),

    findThread: (folders: string[], ids: string[], ownId: string | null) =>
      withClient(account, async (client) => {
        const conditions: SearchObject[] = ids.map((id) => ({ header: { "message-id": id } }));
        if (ownId) conditions.push({ header: { "in-reply-to": ownId } }, { header: { references: ownId } });
        if (!conditions.length) return [];
        const search: SearchObject = conditions.length === 1 ? conditions[0]! : { or: conditions };
        const out: MessageSummary[] = [];
        for (const folder of folders) {
          try {
            const found = await readOnly(client, folder, async () => {
              const uids = await client.search(search, { uid: true });
              const list = Array.isArray(uids) ? uids.slice(-MAX_THREAD_RESULTS) : [];
              return summariesIn(client, folder, list);
            });
            out.push(...found);
          } catch (error) {
            console.warn("[correo] no se pudo buscar la conversación en", folder, error instanceof Error ? error.message : error);
          }
        }
        return out;
      }),

    async openAttachment(folder: string, uid: number, part: string) {
      const client = createImap(account);
      client.on("error", () => undefined);
      let released = false;
      let lock: { release(): void } | null = null;
      const cleanup = async () => {
        if (released) return;
        released = true;
        lock?.release();
        await client.logout().catch(() => client.close());
      };
      try {
        await client.connect();
        lock = await client.getMailboxLock(folder, { readOnly: true });
        const head = await client.fetchOne(String(uid), { uid: true, bodyStructure: true }, { uid: true });
        const attachment = head ? collectAttachments(head.bodyStructure as StructureNode).find((a) => a.part === part) : undefined;
        if (!attachment) throw new MailboxError("Ese adjunto ya no está en el mensaje.", "not_found");
        const download = await client.download(String(uid), part, { uid: true, maxBytes: MAX_DOWNLOAD_BYTES });
        if (!download.content) throw new MailboxError("Ese adjunto ya no está en el mensaje.", "not_found");
        const content = download.content;
        const iterator = content[Symbol.asyncIterator]() as AsyncIterator<Buffer>;
        const stream = new ReadableStream<Uint8Array>({
          async pull(controller) {
            try {
              const { value, done } = await iterator.next();
              if (done) {
                controller.close();
                await cleanup();
                return;
              }
              controller.enqueue(new Uint8Array(value));
            } catch (error) {
              controller.error(error);
              await cleanup();
            }
          },
          async cancel() {
            content.destroy();
            await cleanup();
          },
        });
        return { stream, filename: attachment.filename, contentType: attachment.contentType, size: attachment.size };
      } catch (error) {
        await cleanup().catch(() => client.close());
        throw toMailboxError(error);
      }
    },

    setSeen: (folder: string, uid: number, seen: boolean) =>
      withClient(account, async (client) => {
        const lock = await client.getMailboxLock(folder);
        try {
          if (seen) await client.messageFlagsAdd(String(uid), ["\\Seen"], { uid: true });
          else await client.messageFlagsRemove(String(uid), ["\\Seen"], { uid: true });
        } finally {
          lock.release();
        }
      }),
  };
}
