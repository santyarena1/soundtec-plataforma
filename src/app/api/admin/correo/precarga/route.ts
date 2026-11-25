import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { parseUid } from "@/lib/mail-viewer/search";
import { getMailbox, openMessage, preparedHtml, requireFolder } from "@/server/mail-viewer/service";

export const dynamic = "force-dynamic";

/** Como mucho estos mensajes por pedido (los primeros del listado). */
const MAX_UIDS = 3;

/**
 * Precarga de mensajes del visor (al pasar el mouse o al mostrar el listado):
 * los trae de la casilla a la memoria del servidor para que abrirlos sea
 * inmediato. No devuelve contenido ni cambia nada en la casilla. Solo admins.
 */
export async function POST(req: Request) {
  await requireAdmin();
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new NextResponse(null, { status: 403 });
  const url = new URL(req.url);
  const folder = url.searchParams.get("carpeta") ?? "";
  const uids = [...new Set(url.searchParams.getAll("uid").map(parseUid))].filter((u): u is number => u !== null).slice(0, MAX_UIDS);
  if (!folder || folder.length > 300 || !uids.length) return new NextResponse(null, { status: 400 });
  try {
    const { provider } = await getMailbox();
    await requireFolder(provider, folder);
    // De a uno: ocupa una sola conexión y no le gana el turno a lo que el usuario abre.
    for (const uid of uids) {
      const message = await openMessage(provider, folder, uid).catch(() => null);
      if (message) preparedHtml(message, false);
    }
  } catch {
    // Precargar es un extra: si falla, abrir el mensaje lo vuelve a intentar.
  }
  return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
}
