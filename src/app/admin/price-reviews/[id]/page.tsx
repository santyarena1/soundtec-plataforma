import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { formatDate, formatUsd } from "@/lib/utils";
import { AREA_LABEL, type PriceReviewArea } from "@/lib/price-review/operations";
import type { ReviewRow, ReviewSummary } from "@/lib/price-review/diff";
import { ReviewActions } from "./review-actions";

export const metadata = { title: "Admin · Revisión de cambio de precio" };

const SHOWN_ROWS = 500;
const STATUS_LABEL = { PENDING: "Pendiente", APPLIED: "Aplicada", DISCARDED: "Descartada" } as const;

export default async function PriceReviewPage({ params }: { params: { id: string } }) {
  await requireStaff(["margins.manage", "discounts.manage"], { costs: true });
  const review = await prisma.priceReview.findUnique({ where: { id: params.id } });
  if (!review) notFound();
  const rows = (Array.isArray(review.items) ? review.items : []) as unknown as ReviewRow[];
  const summary = (review.summary ?? null) as unknown as ReviewSummary | null;
  const applied = (review.appliedResult ?? null) as unknown as (ReviewSummary & { simulatedProducts?: number }) | null;
  const diff = review.totalAfterUsd - review.totalBeforeUsd;
  const decided = review.decidedAt
    ? ` · ${review.status === "APPLIED" ? "aplicó" : "descartó"} ${review.decidedByName ?? "—"} el ${formatDate(review.decidedAt)}`
    : "";

  return (
    <div className="space-y-6">
      <Link href="/admin/price-reviews" className="text-sm text-primary hover:underline">
        ← Revisión de cambios
      </Link>
      <PageHeader
        title={review.title}
        description={`${AREA_LABEL[review.area as PriceReviewArea] ?? review.area} · pidió ${review.createdByName ?? "—"} el ${formatDate(review.createdAt)}${decided}`}
        actions={
          <Badge tone={review.status === "PENDING" ? "warning" : review.status === "APPLIED" ? "success" : "muted"}>
            {STATUS_LABEL[review.status]}
          </Badge>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Resumen">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Productos que cambian de precio</p>
          <p className="text-2xl font-semibold tabular-nums">{review.affectedProducts}</p>
          {summary && (summary.up || summary.down) ? (
            <p className="text-xs text-muted-foreground">
              {summary.up} suben · {summary.down} bajan
            </p>
          ) : null}
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Total de esos precios (USD)</p>
          <p className="text-lg font-semibold tabular-nums">
            {formatUsd(review.totalBeforeUsd)} → {formatUsd(review.totalAfterUsd)}
          </p>
          <p className={diff > 0 ? "text-xs text-emerald-700" : diff < 0 ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
            Diferencia {diff > 0 ? "+" : ""}
            {formatUsd(diff)}
            {review.totalBeforeUsd > 0 ? ` (${((diff / review.totalBeforeUsd) * 100).toFixed(2)} %)` : ""}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4 sm:col-span-2">
          <p className="text-xs text-muted-foreground">Por lista</p>
          {summary?.audiences?.length ? (
            <ul className="mt-1 space-y-0.5 text-sm">
              {summary.audiences.map((a) => (
                <li key={a.clientId ?? "general"}>
                  {a.name}: <b className="tabular-nums">{a.rows}</b> producto{a.rows === 1 ? "" : "s"}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm">Lista general</p>
          )}
        </div>
      </section>

      {review.error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          Último intento de aplicar: {review.error}
        </p>
      ) : null}
      {applied && applied.simulatedProducts != null && applied.affectedProducts !== applied.simulatedProducts ? (
        <p className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Al aplicar cambiaron {applied.affectedProducts} productos; la simulación decía {applied.simulatedProducts} (en el medio cambió algún costo o regla).
        </p>
      ) : null}

      <ReviewActions id={review.id} pending={review.status === "PENDING"} zero={review.affectedProducts === 0} />

      {rows.length === 0 ? (
        <TableEmpty message="Este cambio no mueve ningún precio. Igual queda registrado al aplicarlo." />
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Precio de venta en USD sin IVA, calculado con la misma cadena de precios del sistema (márgenes, descuentos y coeficientes).
            {rows.length > SHOWN_ROWS ? ` Se muestran los ${SHOWN_ROWS} cambios más grandes de ${review.affectedRows}; la lista completa está en el Excel.` : ""}
          </p>
          <Table>
            <THead>
              <TR>
                <TH>Producto</TH>
                <TH>Marca</TH>
                <TH>Lista</TH>
                <TH className="text-right">Actual</TH>
                <TH className="text-right">Nuevo</TH>
                <TH className="text-right">Diferencia</TH>
              </TR>
            </THead>
            <TBody>
              {rows.slice(0, SHOWN_ROWS).map((row) => (
                <TR key={`${row.productId}-${row.clientId ?? "g"}`}>
                  <TD className="max-w-sm">
                    <Link href={`/admin/products/${row.productId}`} className="hover:underline">
                      {row.name}
                    </Link>
                    {row.sku ? <span className="block text-xs text-muted-foreground">{row.sku}</span> : null}
                  </TD>
                  <TD className="text-sm">{row.brand ?? "—"}</TD>
                  <TD className="text-xs">{row.audience}</TD>
                  <TD className="text-right tabular-nums">{row.beforeUsd == null ? "—" : formatUsd(row.beforeUsd)}</TD>
                  <TD className="text-right tabular-nums">{row.afterUsd == null ? "—" : formatUsd(row.afterUsd)}</TD>
                  <TD className={`text-right tabular-nums ${row.diffUsd > 0 ? "text-emerald-700" : "text-destructive"}`}>
                    {row.diffUsd > 0 ? "+" : ""}
                    {formatUsd(row.diffUsd)}
                    {row.pct != null ? (
                      <span className="block text-xs">
                        {row.pct > 0 ? "+" : ""}
                        {row.pct.toFixed(2)} %
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </>
      )}
    </div>
  );
}
