/**
 * Vista previa del documento tal como lo va a recibir el cliente.
 *
 * Arma el PDF con el mismo builder que la emisión, pero no lo guarda ni crea
 * revisiones: previsualizar no puede pisar el PDF que ya se mandó. Existe para
 * que "Vista PDF" muestre el documento real y no una reconstrucción parecida,
 * que era la causa de que lo que se veía y lo que se enviaba no coincidieran.
 */

import { NextResponse } from "next/server";
import { loadQuoteForUser } from "@/lib/quote-access";
import { buildQuotePdf } from "@/lib/quote-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { quote, forbidden } = await loadQuoteForUser(id);
  if (forbidden || !quote) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const bytes = await buildQuotePdf(
    {
      number: quote.number,
      reference: quote.reference,
      contactName: quote.contactName,
      issuedAt: quote.issuedAt,
      showDeliveryColumn: quote.showDeliveryColumn,
      taxMode: quote.taxMode,
      client: quote.client,
      owner: {
        quoteSignName: quote.owner.quoteSignName,
        quoteSignTitle: quote.owner.quoteSignTitle,
        name: quote.owner.name,
      },
      items: quote.items,
      itemGroups: quote.itemGroups,
      alternatives: quote.alternatives,
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
    new URL(req.url).origin
  );

  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      // inline: se abre en el visor del navegador, con imprimir y descargar.
      "Content-Disposition": `inline; filename="${quote.number.replace(/[^\w.-]+/g, "_")}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
