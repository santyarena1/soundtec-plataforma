import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { assignProductToSlot } from "@/services/room-builder";

export const dynamic = "force-dynamic";

const schema = z.object({
  slotKey: z.string().min(1),
  productId: z.string().nullable(),
  quantity: z.number().int().positive().optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  try {
    const project = await assignProductToSlot({
      projectId: params.id,
      slotKey: parsed.data.slotKey,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
    });
    return NextResponse.json({ ok: true, project });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
