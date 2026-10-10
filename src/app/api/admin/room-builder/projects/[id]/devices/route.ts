import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { MOUNT_OPTIONS } from "@/services/room-builder/types";
import { addCustomDevice, addGenericDevice, removeCustomDevice, updateGenericDevice } from "@/services/room-builder/custom-devices";

export const dynamic = "force-dynamic";

const MAX_QTY = 48;
const MAX_PRICE_USD = 10_000_000;

const productSchema = z.object({
  productId: z.string().min(1).max(64),
  mount: z.enum(MOUNT_OPTIONS),
  quantity: z.number().int().min(1).max(MAX_QTY).default(1),
});
const genericSchema = z.object({
  generic: z.string().min(1).max(64),
  mount: z.enum(MOUNT_OPTIONS).optional(),
  quantity: z.number().int().min(1).max(MAX_QTY).default(1),
  name: z.string().max(120).optional(),
});

/** Agrega un producto del catálogo o un equipo genérico (plantilla) al ambiente. */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  try {
    const generic = genericSchema.safeParse(body);
    if (generic.success) {
      const project = await addGenericDevice({ projectId: params.id, key: generic.data.generic, mount: generic.data.mount, quantity: generic.data.quantity, name: generic.data.name });
      return NextResponse.json({ ok: true, project });
    }
    const parsed = productSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
    const project = await addCustomDevice({ projectId: params.id, ...parsed.data });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo agregar";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

const patchSchema = z.object({
  slotKey: z.string().min(1).max(80),
  name: z.string().max(120).optional(),
  description: z.string().max(2000).nullable().optional(),
  priceUsd: z.number().min(0).max(MAX_PRICE_USD).nullable().optional(),
});

/** Completa nombre, descripción y precio de un equipo genérico. */
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  await requireAdmin();
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Datos inválidos" }, { status: 400 });
  try {
    const { slotKey, ...patch } = parsed.data;
    const project = await updateGenericDevice(params.id, slotKey, patch);
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "No se pudo guardar";
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
