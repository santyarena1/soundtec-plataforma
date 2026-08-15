import { NextResponse } from "next/server";
import { buildQuoteWorkbook } from "@/server/actions/quote-export";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const { bytes, filename } = await buildQuoteWorkbook(id);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch {
    return NextResponse.json({ error: "No se pudo exportar" }, { status: 400 });
  }
}
