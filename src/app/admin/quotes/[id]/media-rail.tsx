import Link from "next/link";
import { FileImage, Map } from "lucide-react";

export function QuoteMediaRail({
  quoteId,
  planCount,
  imageCount,
}: {
  quoteId: string;
  planCount: number;
  imageCount: number;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm">
      <Link
        href={`/admin/quotes/${quoteId}?paso=2`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-secondary"
      >
        <Map className="h-4 w-4 text-[#1e3553]" />
        <span className="font-medium">Planos</span>
        <span className="tabular-nums text-muted-foreground">{planCount}</span>
      </Link>
      <span className="text-border">|</span>
      <Link
        href={`/admin/quotes/${quoteId}?paso=6`}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-secondary"
      >
        <FileImage className="h-4 w-4 text-[#1e3553]" />
        <span className="font-medium">Imágenes</span>
        <span className="tabular-nums text-muted-foreground">{imageCount}</span>
      </Link>
      <span className="ml-auto text-xs text-muted-foreground">Siempre visibles: no están escondidos en otro paso.</span>
    </div>
  );
}
