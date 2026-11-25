import type { FolderInfo, MessageFilters, MessagePage, MessageSummary } from "@/lib/mail-viewer/types";
import type { ParsedMessage } from "./parse";

/**
 * Lo que el visor necesita de una casilla. Implementaciones: IMAP real
 * (imap-provider) y datos de ejemplo para desarrollo (demo-provider).
 * Todas las lecturas son de solo lectura (EXAMINE + BODY.PEEK): abrir un
 * mensaje no lo marca como leído. La única escritura es setSeen.
 */
export interface MailboxProvider {
  /** Identifica la casilla (para la caché): nunca la contraseña. */
  readonly accountKey: string;
  readonly ownAddress: string;
  listFolders(): Promise<FolderInfo[]>;
  /** UIDs que cumplen el filtro (orden del servidor). */
  searchUids(folder: string, filters: MessageFilters): Promise<number[]>;
  /** Sobre, banderas y estructura de esos UIDs (nunca el mensaje entero). */
  summaries(folder: string, uids: number[]): Promise<MessageSummary[]>;
  /** Los `pageSize` más nuevos sin buscar (una sola ida y vuelta). Opcional. */
  latestPage?(folder: string, pageSize: number): Promise<{ total: number; messages: MessageSummary[] }>;
  getMessage(folder: string, uid: number): Promise<ParsedMessage>;
  /** Mensajes de esas carpetas cuyo Message-ID está en `ids` o que citan a `ownId`. */
  findThread(folders: string[], ids: string[], ownId: string | null): Promise<MessageSummary[]>;
  openAttachment(folder: string, uid: number, part: string): Promise<{ stream: ReadableStream<Uint8Array>; filename: string; contentType: string; size: number }>;
  setSeen(folder: string, uid: number, seen: boolean): Promise<void>;
  /** Abre la conexión de antemano (no espera). Opcional. */
  warm?(): void;
}

export type { MessagePage };
