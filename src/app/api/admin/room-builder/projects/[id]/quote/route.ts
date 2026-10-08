import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { createQuoteFromRoomProject } from "@/services/room-builder";

export const dynamic = "force-dynamic";

const schema = z.object({
  clientId: z.string().nullable().optional(),
  reference: z.string().max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const user = await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Payload inválido" }, { status: 400 });
  }

  try {
    const result = await createQuoteFromRoomProject({
      projectId: params.id,
      ownerId: user.id,
      clientId: parsed.data.clientId,
      reference: parsed.data.reference,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
