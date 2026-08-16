"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { formatUsd } from "@/lib/utils";
import { createQuoteFromRequest } from "@/server/actions/quotes";

export type QuotePreviewLine = {
  role: "main" | "optional";
  name: string;
  quantity: number;
  unitPriceUsd: number;
  note: string | null;
};

export type LinkedQuote = {
  id: string;
  number: string;
  status: string;
  createdAtLabel: string;
};

const QUOTE_STATUS: Record<string, string> = {
  DRAFT: "Borrador",
  IN_REVIEW: "En revisión",
  READY: "Lista",
  ISSUED: "Emitida",
  SUPERSEDED: "Reemplazada",
  ARCHIVED: "Archivada",
};

interface Props {
  requestId: string;
  canCreate: boolean;
  lines: QuotePreviewLine[];
  existingQuotes: LinkedQuote[];
}

export function CreateQuoteCard({ requestId, canCreate, lines, existingQuotes }: Props) {
  const [open, setOpen] = useState(false);
  const [fillAi, setFillAi] = useState(true);
  const [pending, start] = useTransition();
  const router = useRouter();

  const main = lines.filter((l) => l.role === "main");
  const optional = lines.filter((l) => l.role === "optional");
  const total = main.reduce((acc, l) => acc + l.unitPriceUsd * l.quantity, 0);

  function create() {
    start(async () => {
      const r = await createQuoteFromRequest({ requestId, fillAiTexts: fillAi });
      if (!r.ok || !r.quoteId) {
        toast.error(r.error || "No se pudo crear la cotización.");
        return;
      }
      toast.success(`Borrador ${r.quoteNumber} creado`, {
        description: fillAi
          ? "Productos y plantilla listos. La IA va a completar los textos de propuesta."
          : "Productos y plantilla listos. Los textos de propuesta los completás vos.",
      });
      setOpen(false);
      router.push(fillAi ? `/admin/quotes/${r.quoteId}?paso=4&autogen=1` : `/admin/quotes/${r.quoteId}?paso=4`);
    });
  }

  return (
    <>
      <Card>
        <CardContent className="p-5 pt-5">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <CardTitle>Cotización</CardTitle>
          </div>

          {existingQuotes.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {existingQuotes.map((q) => (
                <li key={q.id} className="flex items-center justify-between gap-2 text-sm">
                  <div>
                    <ButtonLink href={`/admin/quotes/${q.id}`} variant="ghost" size="sm" className="h-auto px-0">
                      {q.number}
                    </ButtonLink>
                    <p className="text-xs text-muted-foreground">{q.createdAtLabel}</p>
                  </div>
                  <Badge tone={q.status === "ISSUED" ? "success" : "muted"}>{QUOTE_STATUS[q.status] || q.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Todavía no hay una COT armada a partir de esta solicitud.
            </p>
          )}

          {canCreate ? (
            <Button className="mt-4 w-full" size="sm" onClick={() => setOpen(true)}>
              <FileText className="h-3.5 w-3.5" />
              {existingQuotes.length ? "Crear otra cotización" : "Generar cotización"}
            </Button>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">No tenés permiso para crear cotizaciones.</p>
          )}
        </CardContent>
      </Card>

      <Modal
        open={open}
        onClose={pending ? () => undefined : () => setOpen(false)}
        size="lg"
        icon={<FileText className="h-4 w-4" />}
        title="Generar cotización desde esta solicitud"
        description="Se crea un borrador. Nada se emite ni se manda al cliente hasta que lo revises."
        footer={
          <>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Cancelar
            </Button>
            <Button size="sm" onClick={create} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
              Crear borrador
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <section>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Va en la planilla</p>
            {main.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                No hay productos. La COT nace con la plantilla y el brief; el BOM lo completás después.
              </p>
            ) : (
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-border">
                {main.map((l, i) => (
                  <li key={`${l.name}-${i}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">
                        {l.quantity} × {l.name}
                      </span>
                      {l.note ? <span className="mt-0.5 block text-xs text-muted-foreground">{l.note}</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{formatUsd(l.unitPriceUsd * l.quantity)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {optional.length > 0 ? (
            <section>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Opcionales (el cliente los pidió, el equipo propuso otra cosa)
              </p>
              <ul className="mt-2 divide-y divide-border overflow-hidden rounded-md border border-dashed border-border">
                {optional.map((l, i) => (
                  <li key={`${l.name}-opt-${i}`} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      <span className="font-medium">
                        {l.quantity} × {l.name}
                      </span>
                      {l.note ? <span className="mt-0.5 block text-xs text-muted-foreground">{l.note}</span> : null}
                    </span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{formatUsd(l.unitPriceUsd * l.quantity)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <p className="text-sm">
            Subtotal de líneas principales: <span className="font-semibold">{formatUsd(total)}</span>
          </p>

          <label className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-3">
            <input
              type="checkbox"
              checked={fillAi}
              onChange={(e) => setFillAi(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
            />
            <span className="text-sm">
              <span className="inline-flex items-center gap-1 font-medium">
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                Completar textos con IA
              </span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Redacta propuesta, criterios y funcionalidad. Puede sugerir accesorios o instalación; no pisa los
                productos que ya están en la solicitud.
              </span>
            </span>
          </label>
        </div>
      </Modal>
    </>
  );
}
