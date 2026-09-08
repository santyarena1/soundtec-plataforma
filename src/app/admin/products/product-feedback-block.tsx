"use client";

import { useEffect, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ISSUE_LABELS } from "@/components/admin/ai-feedback-table";
import { listProductAiFeedback, resolveAiFeedback } from "@/server/actions/ai-feedback";

type Row = Awaited<ReturnType<typeof listProductAiFeedback>>[number];
export function ProductFeedbackBlock({ productId }: { productId: string }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [pending, start] = useTransition();
  useEffect(() => {
    listProductAiFeedback(productId).then(setRows);
  }, [productId]);
  if (!rows.length) return null;
  return (
    <div className="space-y-3 rounded-md border border-destructive/30 bg-destructive/5 p-4">
      <h3 className="font-semibold">Reportes de los clientes sobre esta descripción</h3>
      {rows.map((row) => (
        <div key={row.id} className="rounded border bg-card p-3 text-sm">
          <div className="flex flex-wrap gap-1">
            {row.issues.map((i) => (
              <Badge key={i} tone="muted">
                {ISSUE_LABELS[i] || i}
              </Badge>
            ))}
          </div>
          <p className="mt-2">
            <b>Comentario:</b> {row.comment || "—"}
          </p>
          <details className="mt-2">
            <summary>Texto que vio</summary>
            <p className="mt-1 whitespace-pre-wrap text-muted-foreground">
              {row.generatedText || "—"}
            </p>
          </details>
          <Button
            className="mt-2"
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                await resolveAiFeedback(row.id);
                setRows((old) => old.filter((f) => f.id !== row.id));
              })
            }
          >
            Marcar resuelto
          </Button>
        </div>
      ))}
    </div>
  );
}
