import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  analyzeInterconnect,
  applyInterconnectSuggestions,
} from "@/services/room-builder";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  try {
    const analysis = await analyzeInterconnect(params.id);
    return NextResponse.json({ ok: true, ...analysis });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}

const postSchema = z.object({
  productIds: z.array(z.string()).min(1),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  await requireAdmin();
  const body = await req.json().catch(() => null);
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "productIds requerido" }, { status: 400 });
  }
  try {
    const result = await applyInterconnectSuggestions(
      params.id,
      parsed.data.productIds,
    );
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error";
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
