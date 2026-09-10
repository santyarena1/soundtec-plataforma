import { NextResponse } from "next/server";
import { loadQuoteForUser } from "@/lib/quote-access";
import { buildQuoteDocumentHtml } from "@/lib/quote-document-html";

export const dynamic = "force-dynamic";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { quote } = await loadQuoteForUser(id);
  if (!quote) return NextResponse.json({ error: "Sin acceso" }, { status: 403 });

  const html = await buildQuoteDocumentHtml(
    {
      number: quote.number,
      reference: quote.reference,
      contactName: quote.contactName,
      issuedAt: quote.issuedAt,
      showDeliveryColumn: quote.showDeliveryColumn,
      client: quote.client,
      owner: {
        quoteSignName: quote.owner.quoteSignName,
        quoteSignTitle: quote.owner.quoteSignTitle,
        name: quote.owner.name,
      },
      items: quote.items,
      itemGroups: quote.itemGroups,
      sections: quote.sections,
      assets: quote.assets.map((asset) => ({
        id: asset.id,
        url: asset.url,
        sectionId: asset.sectionId,
        sortOrder: asset.sortOrder,
      })),
    },
    { origin: new URL(req.url).origin, forWord: true }
  );

  return new NextResponse(html, {
    headers: {
      "Content-Type": "application/msword; charset=utf-8",
      "Content-Disposition": `attachment; filename="${quote.number}.doc"`,
    },
  });
}
