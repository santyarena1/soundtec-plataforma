import { NextRequest, NextResponse } from "next/server";
import { requireRoomProjectAccess } from "@/server/room-builder/access";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Imagen del plano subido para un ambiente del Room Builder. */
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  await requireRoomProjectAccess(params.id);
  const plan = await prisma.roomPlanImage.findUnique({
    where: { roomProjectId: params.id },
    select: { data: true, mimeType: true },
  });
  if (!plan) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(plan.data), {
    headers: {
      "Content-Type": plan.mimeType,
      // La URL lleva ?v=<subida>, así que puede cachearse en el navegador.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
