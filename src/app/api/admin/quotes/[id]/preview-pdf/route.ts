/**
 * Vista previa del documento tal como lo va a recibir el cliente.
 *
 * Arma el documento con el mismo builder que la emisión, pero no lo guarda ni
 * crea revisiones: previsualizar no puede pisar el PDF que ya se mandó. Existe
 * para que «Vista PDF» muestre el documento real y no una reconstrucción
 * parecida, que era la causa de que lo que se veía y lo que se enviaba no
 * coincidieran.
 */

import { NextResponse } from "next/server";
import { loadQuoteForUser } from "@/lib/quote-access";
import { buildQuoteDocumentHtml } from "@/lib/quote-document-html";
import { htmlToPdf } from "@/lib/html-to-pdf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { quote, forbidden } = await loadQuoteForUser(id);
  if (forbidden || !quote) {
    return NextResponse.json({ error: "Sin acceso" }, { status: 403 });
  }

  const html = await buildQuoteDocumentHtml(
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
    { origin: new URL(req.url).origin, forWord: false }
  );

  try {
    const bytes = await htmlToPdf(html);
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // inline: se abre en el visor del navegador, con imprimir y descargar.
        "Content-Disposition": `inline; filename="${quote.number.replace(/[^\w.-]+/g, "_")}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    // Si el navegador del servidor no arranca, igual se muestra el documento:
    // es el mismo HTML del que sale el PDF, así que sigue siendo fiel al que
    // recibe el cliente y se puede imprimir desde el navegador.
    console.error("preview-pdf: no se pudo generar el PDF", error);
    return new NextResponse(html, {
      headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
    });
  }
}
