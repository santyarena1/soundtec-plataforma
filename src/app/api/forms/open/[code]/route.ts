import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { PIXEL_HEADERS, TRANSPARENT_GIF, registerOpen } from "@/lib/forms/invite-tracking";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Píxel de apertura de las invitaciones de Formularios. Público (lo pide el
 * programa de correo), sin sesión. Siempre devuelve el GIF, aunque el código no
 * exista: no da pistas sobre qué códigos son válidos.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  try {
    await registerOpen(
      {
        find: (c) => prisma.formInvite.findUnique({ where: { code: c }, select: { id: true, openedAt: true, clickedAt: true, sentAt: true } }),
        update: async (id, data) => {
          await prisma.formInvite.update({ where: { id }, data });
        },
      },
      code,
      new Date()
    );
  } catch (error) {
    console.error("[forms] no se pudo anotar la apertura", error);
  }
  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), { status: 200, headers: PIXEL_HEADERS });
}
