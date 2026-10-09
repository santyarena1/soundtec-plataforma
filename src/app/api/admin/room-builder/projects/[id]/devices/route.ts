import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { MOUNT_OPTIONS } from "@/services/room-builder/types";
import { addCustomDevice, removeCustomDevice } from "@/services/room-builder/custom-devices";

export const dynamic = "force-dynamic";

const addSchema = z.object({
  productId: z.string().min(1).max(64),
  mount: z.enum(MOUNT_OPTIONS),
  quantity: z.number().int().min(1).max(48).default(1),
});

/** Agrega cualquier producto del catálogo al ambiente. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const parsed = addSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  try {
    const project = await addCustomDevice({ projectId: params.id, ...parsed.data });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo agregar";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

/** Quita un equipo agregado a mano. */
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const slotKey = req.nextUrl.searchParams.get("slotKey") ?? "";
  if (!slotKey || slotKey.length > 80) return NextResponse.json({ ok: false, error: "Equipo inválido" }, { status: 400 });
  try {
    const project = await removeCustomDevice(params.id, slotKey);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo quitar";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
