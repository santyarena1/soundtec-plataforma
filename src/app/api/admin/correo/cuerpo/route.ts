import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { textToViewerHtml, viewerCsp } from "@/lib/mail-viewer/sanitize";
import { parseUid } from "@/lib/mail-viewer/search";
import { getMailbox, openMessage, preparedHtml, requireFolder } from "@/server/mail-viewer/service";

export const dynamic = "force-dynamic";

function page(html: string, allowImages: boolean, status = 200) {
  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": viewerCsp(allowImages),
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * Cuerpo de un mail de la casilla del portal, saneado, para el iframe aislado
 * del visor. Solo admins. `imagenes=1` deja pasar las imágenes remotas.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const folder = url.searchParams.get("carpeta") ?? "";
  const uid = parseUid(url.searchParams.get("uid"));
  const allowImages = url.searchParams.get("imagenes") === "1";
  if (!folder || folder.length > 300 || !uid) return page(textToViewerHtml("Pedido inválido."), false, 400);
  try {
    const { provider } = await getMailbox();
    // Carpeta y mensaje en paralelo (los dos suelen estar ya en memoria).
    const [, message] = await Promise.all([requireFolder(provider, folder), openMessage(provider, folder, uid)]);
    const prepared = preparedHtml(message, allowImages);
    if (!prepared) return page(textToViewerHtml(message.detail.text || "(Mensaje sin texto)"), false);
    return page(prepared.html, allowImages);
  } catch (error) {
    const e = toMailboxError(error);
    return page(textToViewerHtml(e.message), false, e.code === "not_found" || e.code === "invalid" ? 404 : 502);
  }
}
