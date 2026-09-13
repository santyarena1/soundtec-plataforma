import { NextResponse } from "next/server";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { generateAndStoreQuotePdf, loadStoredQuotePdf } from "@/lib/quote-pdf-store";
import { canViewQuote } from "@/lib/quote-access";
import { parseQuoteAttachments } from "@/lib/request-quote-link";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { user, permissions } = await getCurrentPermissions();
  const quote = await prisma.quote.findUnique({
    where: { id },
    select: { id: true, ownerId: true, sourceRequestId: true, number: true },
  });
  if (!quote) return NextResponse.json({ error: "No encontrada" }, { status: 404 });

  // Del staff, solo quien puede ver ESTA cotización: antes alcanzaba con
  // tener cualquier permiso de cotizaciones para bajar la de otro vendedor.
  const isStaff =
    user.role !== "CLIENT" &&
    canViewQuote({ ownerId: quote.ownerId, userId: user.id, permissions });
  if (!isStaff) {
    if (!quote.sourceRequestId) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
    const request = await prisma.customerRequest.findFirst({
      where: { id: quote.sourceRequestId, userId: user.id },
      include: { messages: { select: { attachments: true } } },
    });
    const attached = request?.messages.some((message) =>
      parseQuoteAttachments(message.attachments).some((att) => att.quoteId === quote.id)
    );
    if (!attached) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  let stored = await loadStoredQuotePdf(quote.id);
  if (!stored && isStaff) {
    const generated = await generateAndStoreQuotePdf(quote.id, user.id);
    stored = { bytes: generated.bytes, filename: `${quote.number.replace(/[^\w.-]+/g, "_")}.pdf` };
  }
  if (!stored) return NextResponse.json({ error: "Todavía no hay un PDF generado." }, { status: 404 });

  return new NextResponse(Buffer.from(stored.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${stored.filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
