import Link from "next/link";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { cn, formatDate, formatUsd } from "@/lib/utils";
import { AREA_LABEL, type PriceReviewArea } from "@/lib/price-review/operations";

export const metadata = { title: "Admin · Revisión de cambios de precio" };

const TABS = [
  { id: "PENDING", label: "Pendientes" },
  { id: "APPLIED", label: "Aplicadas" },
  { id: "DISCARDED", label: "Descartadas" },
] as const;

export default async function PriceReviewsPage({ searchParams }: { searchParams: { estado?: string } }) {
  await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  const status = TABS.find((t) => t.id === searchParams.estado)?.id ?? "PENDING";
  const [reviews, counts] = await Promise.all([
    prisma.priceReview.findMany({
      where: { status },
      orderBy: status === "PENDING" ? { createdAt: "desc" } : { decidedAt: "desc" },
      take: 200,
      select: {
        id: true,
        title: true,
        area: true,
        status: true,
        affectedProducts: true,
        affectedRows: true,
        totalBeforeUsd: true,
        totalAfterUsd: true,
        createdByName: true,
        createdAt: true,
        decidedByName: true,
        decidedAt: true,
        error: true,
      },
    }),
    prisma.priceReview.groupBy({ by: ["status"], _count: { _all: true } }),
  ]);
  const countOf = (id: string) => counts.find((c) => c.status === id)?._count._all ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Revisión de cambios de precio"
        description="Todo cambio de reglas de margen o descuento, o de rubros cuando hay reglas por rubro, se calcula antes de aplicarse: qué productos cambian de precio y cuánto. Nada se aplica hasta que alguien toca «Aplicar». Los cambios de costo que traen los proveedores no pasan por acá (se ven en el Inicio)."
      />
      <nav className="flex gap-2" aria-label="Estado">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={`/admin/price-reviews?estado=${tab.id}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              status === tab.id ? "border-primary bg-primary text-primary-foreground" : "border-border hover:bg-secondary"
            )}
          >
            {tab.label} ({countOf(tab.id)})
          </Link>
        ))}
      </nav>
      {reviews.length === 0 ? (
        <TableEmpty message={status === "PENDING" ? "No hay cambios esperando revisión." : "Todavía no hay ninguno."} />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Cambio</TH>
              <TH>Pantalla</TH>
              <TH className="text-right">Productos</TH>
              <TH className="text-right">Total antes → después (USD)</TH>
              <TH>Pidió</TH>
              {status !== "PENDING" ? <TH>{status === "APPLIED" ? "Aplicó" : "Descartó"}</TH> : null}
            </TR>
          </THead>
          <TBody>
            {reviews.map((r) => {
              const diff = r.totalAfterUsd - r.totalBeforeUsd;
              return (
                <TR key={r.id}>
                  <TD className="max-w-md">
                    <Link href={`/admin/price-reviews/${r.id}`} className="font-medium text-primary hover:underline">
                      {r.title}
                    </Link>
                    {r.error ? <p className="text-xs text-destructive">No se pudo aplicar: {r.error}</p> : null}
                  </TD>
                  <TD>
                    <Badge tone="muted">{AREA_LABEL[r.area as PriceReviewArea] ?? r.area}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {r.affectedProducts === 0 ? <span className="text-muted-foreground">ninguno</span> : r.affectedProducts}
                  </TD>
                  <TD className="text-right tabular-nums">
                    {r.affectedProducts === 0 ? (
                      "—"
                    ) : (
                      <>
                        {formatUsd(r.totalBeforeUsd)} → {formatUsd(r.totalAfterUsd)}{" "}
                        <span className={diff > 0 ? "text-emerald-700" : diff < 0 ? "text-destructive" : ""}>
                          ({diff > 0 ? "+" : ""}
                          {formatUsd(diff)})
                        </span>
                      </>
                    )}
                  </TD>
                  <TD className="text-xs">
                    {r.createdByName ?? "—"}
                    <br />
                    <span className="text-muted-foreground">{formatDate(r.createdAt)}</span>
                  </TD>
                  {status !== "PENDING" ? (
                    <TD className="text-xs">
                      {r.decidedByName ?? "—"}
                      <br />
                      <span className="text-muted-foreground">{formatDate(r.decidedAt)}</span>
                    </TD>
                  ) : null}
                </TR>
              );
            })}
          </TBody>
        </Table>
      )}
    </div>
  );
}
