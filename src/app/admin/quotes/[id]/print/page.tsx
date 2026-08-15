import { notFound } from "next/navigation";
import Link from "next/link";
import { loadQuoteForUser } from "@/lib/quote-access";
import { QuoteDocument } from "@/components/quotes/quote-document";
import { PrintQuoteButton } from "./print-button";

export const metadata = { title: "Imprimir cotización" };

export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { quote, forbidden } = await loadQuoteForUser(id);
  if (forbidden || !quote) notFound();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href={`/admin/quotes/${quote.id}`} className="text-sm text-muted-foreground hover:underline">
          Volver al editor
        </Link>
        <PrintQuoteButton />
      </div>
      <QuoteDocument quote={quote} />
    </div>
  );
}
