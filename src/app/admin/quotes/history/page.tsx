import { requireQuotePermission } from "@/lib/quote-access";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { HistoryIngestForm } from "./ingest-form";

export const metadata = { title: "Admin · Memoria histórica de COT" };

export default async function QuoteHistoryPage() {
  await requireQuotePermission("quotes.manage_library");
  const [sheets, lines] = await Promise.all([
    prisma.historicalQuoteSheet.count(),
    prisma.historicalQuoteLine.count(),
  ]);
  const recent = await prisma.historicalQuoteSheet.findMany({
    orderBy: { ingestedAt: "desc" },
    take: 20,
    include: { _count: { select: { lines: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Memoria histórica"
        description="Planillas 5.0: qué se cotizó junto. No se reutilizan precios."
        actions={<ButtonLink href="/admin/quotes" variant="outline" size="sm">Volver a cotizaciones</ButtonLink>}
      />
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="text-sm text-muted-foreground">
            Subí <strong>Planillas de Cotizacion 5.0.xlsx</strong>. Se ignoran hojas LIBRE. Al generar una propuesta, el copiloto sugiere ítems que solían ir juntos.
          </p>
          <p className="text-sm">
            Cargadas: {sheets} hojas · {lines} líneas.
          </p>
          <HistoryIngestForm />
        </CardContent>
      </Card>
      {recent.length > 0 ? (
        <ul className="divide-y rounded-lg border border-border bg-card text-sm">
          {recent.map((s) => (
            <li key={s.id} className="flex justify-between px-4 py-2">
              <span>{s.sheetName}</span>
              <span className="text-muted-foreground">{s._count.lines} líneas</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
