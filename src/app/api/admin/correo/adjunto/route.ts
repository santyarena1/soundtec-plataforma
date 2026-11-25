import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { attachmentDisposition } from "@/lib/mail-viewer/attachments";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { parsePart, parseUid } from "@/lib/mail-viewer/search";
import { getMailbox, requireFolder } from "@/server/mail-viewer/service";

export const dynamic = "force-dynamic";

/**
 * Descarga un adjunto de la casilla del portal directo desde IMAP (streaming,
 * sin guardarlo). Solo admins; carpeta, UID y parte validados contra la casilla
 * y la estructura del mensaje. Siempre como descarga, nunca para mostrar.
 */
export async function GET(req: Request) {
  await requireAdmin();
  const url = new URL(req.url);
  const folder = url.searchParams.get("carpeta") ?? "";
  const uid = parseUid(url.searchParams.get("uid"));
  const part = parsePart(url.searchParams.get("parte"));
  if (!folder || folder.length > 300 || !uid || !part) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  try {
    const { provider } = await getMailbox();
    await requireFolder(provider, folder);
    const file = await provider.openAttachment(folder, uid, part);
    return new NextResponse(file.stream, {
      headers: {
        // Siempre binario: el navegador no intenta abrir HTML/SVG adjuntos en el dominio del portal.
        "Content-Type": "application/octet-stream",
        "Content-Disposition": attachmentDisposition(file.filename),
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const e = toMailboxError(error);
    return NextResponse.json({ error: e.message }, { status: e.code === "not_found" || e.code === "invalid" ? 404 : 502 });
  }
}
