"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Eye, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { deleteQuote, duplicateQuote } from "@/server/actions/quotes";
import { loadQuoteSummary, type QuoteSummary } from "@/server/actions/quote-summary";

export type QuoteListRow = {
  id: string;
  number: string;
  requestTag: string | null;
  client: string;
  owner: string;
  reference: string | null;
  status: string;
  statusLabel: string;
  statusTone: "success" | "warning" | "muted" | "accent" | "primary" | "neutral" | "destructive";
  net: number;
  created: string;
  expires: { label: string; expired: boolean } | null;
  issued: boolean;
};

/** PDF: el emitido si está emitida; si no, el documento como está ahora. */
const pdfHref = (row: QuoteListRow) => (row.issued ? `/api/quotes/${row.id}/pdf` : `/api/admin/quotes/${row.id}/preview-pdf`);

function Summary({ data }: { data: Extract<QuoteSummary, { ok: true }> }) {
  return (
    <div className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_16rem]">
      <div className="overflow-x-auto">
        {data.items.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-muted-foreground">
              <tr>
                <th className="py-1 pr-2 font-medium">Producto</th>
                <th className="py-1 pr-2 text-right font-medium">Cant.</th>
                <th className="py-1 pr-2 text-right font-medium">Unitario</th>
                <th className="py-1 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr key={item.id} className={`border-t border-border ${item.note ? "text-muted-foreground" : ""}`}>
                  <td className="max-w-[28rem] truncate py-1 pr-2" title={item.name}>
                    {item.name}
                    {item.note ? <span className="ml-1 italic">({item.note})</span> : null}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">
                    {item.quantity} {item.unit}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{item.unitPriceUsd > 0 ? formatUsd(item.unitPriceUsd) : "Sin cargo"}</td>
                  <td className="py-1 text-right tabular-nums">{item.lineTotalUsd > 0 ? formatUsd(item.lineTotalUsd) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-muted-foreground">Sin productos todavía.</p>
        )}
      </div>
      <dl className="space-y-1.5 rounded-lg bg-secondary/50 p-3 text-xs">
        <div>
          <dt className="text-muted-foreground">Cliente</dt>
          <dd className="font-medium">{data.client || "Sin cliente"}</dd>
        </div>
        {data.contact ? (
          <div>
            <dt className="text-muted-foreground">Contacto</dt>
            <dd>{data.contact}</dd>
          </div>
        ) : null}
        {data.paymentTerms ? (
          <div>
            <dt className="text-muted-foreground">Forma de pago</dt>
            <dd>{data.paymentTerms}</dd>
          </div>
        ) : null}
        {data.validityDays ? (
          <div>
            <dt className="text-muted-foreground">Vigencia</dt>
            <dd>{data.validityDays} días</dd>
          </div>
        ) : null}
        <div className="border-t border-border pt-1.5">
          <div className="flex justify-between">
            <dt>Neto</dt>
            <dd className="tabular-nums">{formatUsd(data.totals.net)}</dd>
          </div>
          {data.totals.tax > 0 ? (
            <div className="flex justify-between">
              <dt>IVA</dt>
              <dd className="tabular-nums">{formatUsd(data.totals.tax)}</dd>
            </div>
          ) : null}
          <div className="flex justify-between text-sm font-semibold">
            <dt>Total</dt>
            <dd className="tabular-nums">{formatUsd(data.totals.total)}</dd>
          </div>
          {data.taxMode === "NOTE" ? <p className="text-muted-foreground">+ IVA</p> : null}
        </div>
      </dl>
    </div>
  );
}

export function QuotesTable({ rows, canEdit }: { rows: QuoteListRow[]; canEdit: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<Record<string, QuoteSummary>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function toggle(id: string) {
    if (open === id) return setOpen(null);
    setOpen(id);
    if (summaries[id]) return;
    setLoading(id);
    loadQuoteSummary(id)
      .then((summary) => setSummaries((old) => ({ ...old, [id]: summary })))
      .catch(() => setSummaries((old) => ({ ...old, [id]: { ok: false, error: "No se pudo cargar." } })))
      .finally(() => setLoading(null));
  }

  const iconButton = "inline-flex h-8 items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";

  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-secondary/60 text-left text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="w-8 px-2 py-2" />
            <th className="px-2 py-2 font-medium">Número</th>
            <th className="px-2 py-2 font-medium">Cliente</th>
            <th className="px-2 py-2 font-medium">Referencia</th>
            <th className="px-2 py-2 text-right font-medium">Total neto</th>
            <th className="px-2 py-2 font-medium">Fecha</th>
            <th className="px-2 py-2 text-right font-medium">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isOpen = open === row.id;
            const summary = summaries[row.id];
            return (
              <Fragment key={row.id}>
                <tr
                  className={`cursor-pointer border-b border-border transition-colors hover:bg-secondary/40 ${isOpen ? "bg-secondary/40" : ""}`}
                  onClick={() => toggle(row.id)}
                >
                  <td className="px-2 py-2 text-muted-foreground">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    <span className="font-medium">{row.number}</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      <Badge tone={row.statusTone}>{row.statusLabel}</Badge>
                      {row.requestTag ? <Badge tone="accent">Pedido #{row.requestTag}</Badge> : null}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <span className="block max-w-[13rem] truncate" title={row.client}>{row.client}</span>
                    <span className="block text-xs text-muted-foreground">{row.owner}</span>
                  </td>
                  <td className="max-w-[12rem] truncate px-2 py-2" title={row.reference ?? undefined}>
                    {row.reference || "—"}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{formatUsd(row.net)}</td>
                  <td className="whitespace-nowrap px-2 py-2">
                    {row.created}
                    {row.expires ? <span className={`block text-xs ${row.expires.expired ? "text-destructive" : "text-muted-foreground"}`}>{row.expires.label}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5">
                      <button type="button" className={iconButton} onClick={() => toggle(row.id)} aria-expanded={isOpen}>
                        <Eye className="h-3.5 w-3.5" /> Ver
                      </button>
                      <Link href={`/admin/quotes/${row.id}`} className={iconButton}>
                        <Pencil className="h-3.5 w-3.5" /> Editar
                      </Link>
                      <a href={pdfHref(row)} target="_blank" rel="noreferrer" className={iconButton} title={row.issued ? "PDF emitido" : "Documento como está ahora (sin emitir)"}>
                        <FileText className="h-3.5 w-3.5" /> PDF
                      </a>
                      {canEdit ? (
                        <>
                          <form action={duplicateQuote}>
                            <input type="hidden" name="quoteId" value={row.id} />
                            <button type="submit" className={iconButton} title="Duplicar" aria-label={`Duplicar ${row.number}`}>
                              <Copy className="h-3.5 w-3.5" />
                            </button>
                          </form>
                          <button
                            type="button"
                            className={`${iconButton} hover:text-destructive`}
                            title="Eliminar"
                            aria-label={`Eliminar ${row.number}`}
                            disabled={pending}
                            onClick={() => {
                              if (!window.confirm(`¿Eliminar ${row.number}? No se puede deshacer.`)) return;
                              start(async () => {
                                const fd = new FormData();
                                fd.set("quoteId", row.id);
                                const result = await deleteQuote(fd);
                                if (result.error) toast.error(result.error);
                                router.refresh();
                              });
                            }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-b border-border bg-background">
                    <td colSpan={7}>
                      {loading === row.id && !summary ? (
                        <p className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
                        </p>
                      ) : summary?.ok ? (
                        <Summary data={summary} />
                      ) : (
                        <p className="p-4 text-sm text-destructive">{summary && !summary.ok ? summary.error : ""}</p>
                      )}
                    </td>
                  </tr>
                ) : null}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
