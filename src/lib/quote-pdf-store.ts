import { prisma } from "@/lib/prisma";
import { storeQuoteBlob } from "@/server/actions/quote-images";
import { buildQuotePdf } from "@/lib/quote-pdf";

function appOrigin() {
  const raw =
    process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "");
  return raw.replace(/\/$/, "") || undefined;
}

export async function generateAndStoreQuotePdf(quoteId: string, actorId: string) {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      client: { select: { companyName: true, tradeName: true } },
      owner: { select: { quoteSignName: true, quoteSignTitle: true, name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              normalizedName: true,
              shortDescription: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
      itemGroups: { orderBy: { sortOrder: "asc" } },
      sections: { orderBy: { sortOrder: "asc" } },
      assets: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!quote) throw new Error("La cotización ya no existe.");

  const bytes = await buildQuotePdf(
    {
      number: quote.number,
      reference: quote.reference,
      contactName: quote.contactName,
      issuedAt: quote.issuedAt,
      showDeliveryColumn: quote.showDeliveryColumn,
      client: quote.client,
      owner: quote.owner,
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
    appOrigin()
  );
  const filename = `${quote.number.replace(/[^\w.-]+/g, "_")}.pdf`;
  const file = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const stored = await storeQuoteBlob(`quotes/${quote.id}/${filename}`, file, "application/pdf");

  await prisma.quote.update({
    where: { id: quote.id },
    data: { pdfBlobUrl: stored || `/api/quotes/${quote.id}/pdf` },
  });

  await prisma.quoteRevision.create({
    data: {
      quoteId: quote.id,
      actorId,
      summary: `PDF ${quote.number}`,
      snapshot: {
        kind: "client-pdf",
        number: quote.number,
        pdfBase64: stored ? undefined : Buffer.from(bytes).toString("base64"),
      },
    },
  });

  return { url: stored || `/api/quotes/${quote.id}/pdf`, number: quote.number, bytes };
}

export async function loadStoredQuotePdf(
  quoteId: string
): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: { number: true, pdfBlobUrl: true },
  });
  if (!quote) return null;
  const filename = `${quote.number.replace(/[^\w.-]+/g, "_")}.pdf`;

  if (quote.pdfBlobUrl?.startsWith("http")) {
    const res = await fetch(quote.pdfBlobUrl);
    if (res.ok) return { bytes: new Uint8Array(await res.arrayBuffer()), filename };
  }

  const revision = await prisma.quoteRevision.findFirst({
    where: { quoteId, summary: { startsWith: "PDF " } },
    orderBy: { createdAt: "desc" },
    select: { snapshot: true },
  });
  const snap = revision?.snapshot as { pdfBase64?: string } | null;
  if (snap?.pdfBase64) {
    return { bytes: new Uint8Array(Buffer.from(snap.pdfBase64, "base64")), filename };
  }
  return null;
}
