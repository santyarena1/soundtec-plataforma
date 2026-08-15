import { NextResponse } from "next/server";
import { generateQuoteFromBrief } from "@/server/actions/quote-ai";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const r = await generateQuoteFromBrief(id);
  return NextResponse.json(r, { status: r.ok ? 200 : 400 });
}
