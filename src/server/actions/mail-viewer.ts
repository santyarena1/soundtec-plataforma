"use server";

import { revalidatePath } from "next/cache";
import { getImpersonation, requireAdmin } from "@/lib/auth-helpers";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { parseUid } from "@/lib/mail-viewer/search";
import { getMailbox, invalidateListings, requireFolder, setSeen } from "@/server/mail-viewer/service";

type Result = { ok: true } | { ok: false; error: string };

/**
 * Única escritura del visor en la casilla: marcar un mensaje como leído o no
 * leído. Solo admins y nunca durante «Ver como» (solo lectura).
 */
export async function setMessageSeenAction(input: { folder: string; uid: number; seen: boolean }): Promise<Result> {
  await requireAdmin();
  if (await getImpersonation()) return { ok: false, error: "En «Ver como» la casilla es solo lectura." };
  const uid = parseUid(input?.uid);
  const folder = typeof input?.folder === "string" ? input.folder : "";
  if (!uid || !folder || folder.length > 300 || typeof input.seen !== "boolean") return { ok: false, error: "Pedido inválido." };
  try {
    const { provider } = await getMailbox();
    await requireFolder(provider, folder);
    await setSeen(provider, folder, uid, input.seen);
  } catch (error) {
    return { ok: false, error: toMailboxError(error).message };
  }
  revalidatePath("/admin/correo");
  return { ok: true };
}

/**
 * «Actualizar» del visor: descarta carpetas, listados, conversaciones y lo
 * recibido de «Actividad» para que se vuelvan a pedir. Los mensajes ya abiertos
 * quedan (un mensaje no cambia de contenido). No escribe en la casilla.
 */
export async function refreshMailboxAction(): Promise<Result> {
  await requireAdmin();
  try {
    const { provider } = await getMailbox();
    invalidateListings(provider);
  } catch (error) {
    return { ok: false, error: toMailboxError(error).message };
  }
  return { ok: true };
}
