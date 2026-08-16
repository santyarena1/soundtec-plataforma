import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { parseQuoteAttachments } from "@/lib/request-quote-link";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";

export const metadata = { title: "Cotización" };

export default async function PortalRequestQuotePage({
  params,
}: {
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const { id, quoteId } = await params;
  const user = await requireUser();
  const request = await prisma.customerRequest.findFirst({
    where: { id, userId: user.id },
    include: { messages: { select: { attachments: true } } },
  });
  if (!request) notFound();

  const attached = request.messages.some((message) =>
    parseQuoteAttachments(message.attachments).some((att) => att.quoteId === quoteId)
  );
  if (!attached) notFound();

  const quote = await prisma.quote.findFirst({
    where: { id: quoteId, sourceRequestId: request.id },
    include: {
      client: { select: { id: true, companyName: true, tradeName: true } },
      owner: { select: { id: true, name: true, email: true, quoteSignName: true, quoteSignTitle: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              normalizedName: true,
              shortDescription: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
      sections: { orderBy: { sortOrder: "asc" } },
      assets: { orderBy: { sortOrder: "asc" } },
      terms: true,
    },
  });
  if (!quote) notFound();

  return (
    <div className="space-y-4">
      <Link
        href={`/portal/requests/${request.id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Volver a la solicitud
      </Link>
      <PageHeader
        title={quote.number}
        description={quote.reference || "Cotización adjunta a tu solicitud"}
        actions={
          <ButtonLink href={`/portal/requests/${request.id}`} size="sm" variant="outline">
            Cerrar
          </ButtonLink>
        }
      />
      <div className="overflow-x-auto bg-neutral-300/40 p-4">
        <QuoteDocument quote={quote} />
      </div>
    </div>
  );
}
