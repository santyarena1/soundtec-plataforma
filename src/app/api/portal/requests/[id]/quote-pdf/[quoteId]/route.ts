import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { loadStoredQuotePdf } from "@/lib/quote-pdf-store";
import { parseQuoteAttachments } from "@/lib/request-quote-link";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string; quoteId: string }> }) {
  const { id, quoteId } = await ctx.params;
  const user = await requireUser();
  const request = await prisma.customerRequest.findFirst({
    where: { id, userId: user.id },
    include: { messages: { select: { attachments: true } } },
  });
  if (!request) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const attached = request.messages.some((message) =>
    parseQuoteAttachments(message.attachments).some((att) => att.quoteId === quoteId)
  );
  if (!attached) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const stored = await loadStoredQuotePdf(quoteId);
  if (!stored) return NextResponse.json({ error: "El PDF todavía no está disponible." }, { status: 404 });

  return new NextResponse(Buffer.from(stored.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${stored.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
