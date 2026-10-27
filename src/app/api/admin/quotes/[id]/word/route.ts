import { cleanQuoteReference } from "@/lib/quote-status";
import { visibleQuoteBrandLogos } from "@/lib/quote-brands";
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
      reference: cleanQuoteReference(quote.reference),
      contactName: quote.contactName,
      issuedAt: quote.issuedAt,
      showDeliveryColumn: quote.showDeliveryColumn,
      showProductPhotos: quote.showProductPhotos,
      taxMode: quote.taxMode,
      client: quote.client ?? (quote.clientName ? { companyName: quote.clientName, tradeName: null } : null),
      owner: {
        quoteSignName: quote.owner.quoteSignName,
        quoteSignTitle: quote.owner.quoteSignTitle,
        name: quote.owner.name,
      },
      items: quote.items,
      itemGroups: quote.itemGroups,
      alternatives: quote.alternatives,
      brandLogos: await visibleQuoteBrandLogos(quote.id),
      terms: quote.terms,
      sections: quote.sections,
      assets: quote.assets.map((asset) => ({
        id: asset.id,
        url: asset.url,
        sectionId: asset.sectionId,
        sortOrder: asset.sortOrder,
        productId: asset.productId,
        kind: asset.kind,
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
