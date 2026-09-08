"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/dialog";
import { resolveAiFeedback } from "@/server/actions/ai-feedback";

export const ISSUE_LABELS: Record<string, string> = {
  specs_wrong: "Especificaciones incorrectas",
  wrong_product: "Describe otro producto",
  price_or_availability: "Precio o disponibilidad",
  compatibility: "Compatibilidad / accesorios",
  language: "Redacción o idioma",
  missing_info: "Falta información",
  other: "Otro",
};
export type FeedbackDetail = {
  id: string;
  verdict: string | null;
  type: string;
  issues: string[];
  comment: string | null;
  generatedText: string | null;
  createdAt: string;
  resolvedAt: string | null;
  userName: string;
  userEmail: string;
  productId: string | null;
  productName: string;
  currentText: string | null;
};

export function AiFeedbackTable({ rows }: { rows: FeedbackDetail[] }) {
  const [selected, setSelected] = useState<FeedbackDetail | null>(null);
  const [pending, start] = useTransition();
  return (
    <>
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="bg-secondary">
            <tr>
              <th className="p-2 text-left">Producto</th>
              <th className="p-2 text-left">Veredicto</th>
              <th className="p-2 text-left">Motivos</th>
              <th className="p-2 text-left">Comentario</th>
              <th className="p-2">Estado</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t">
                <td className="p-2">{row.productName}</td>
                <td className="p-2">
                  <Badge
                    tone={
                      row.verdict === "HAS_ERRORS"
                        ? "destructive"
                        : row.verdict === "CORRECT"
                          ? "success"
                          : "muted"
                    }
                  >
                    {row.verdict === "UNCLEAR"
                      ? "Sin definir"
                      : row.verdict === "HAS_ERRORS"
                        ? "Con errores"
                        : "Correcto"}
                  </Badge>
                </td>
                <td className="p-2">
                  <div className="flex flex-wrap gap-1">
                    {row.issues.map((i) => (
                      <Badge key={i} tone="muted">
                        {ISSUE_LABELS[i] || i}
                      </Badge>
                    ))}
                  </div>
                </td>
                <td className="max-w-sm p-2">
                  <span className="line-clamp-2">{row.comment || "—"}</span>
                </td>
                <td className="p-2 text-center">{row.resolvedAt ? "Resuelto" : "Pendiente"}</td>
                <td className="p-2">
                  <Button size="sm" variant="ghost" onClick={() => setSelected(row)}>
                    Ver más
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        title="Detalle del reporte"
        size="xl"
        footer={
          selected ? (
            <>
              {selected.productId ? (
                <Button
                  variant="outline"
                  onClick={() => (window.location.href = "/admin/products/" + selected.productId)}
                >
                  Ir a editar la ficha
                </Button>
              ) : null}
              {!selected.resolvedAt ? (
                <Button
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      await resolveAiFeedback(selected.id);
                      setSelected(null);
                      window.location.reload();
                    })
                  }
                >
                  Marcar resuelto
                </Button>
              ) : null}
            </>
          ) : null
        }
      >
        {selected ? (
          <div className="space-y-4 text-sm">
            <p>
              <b>Producto:</b> {selected.productName}
            </p>
            <p>
              <b>Usuario:</b> {selected.userName} · {selected.userEmail}
            </p>
            <div>
              <b>Motivos:</b>
              <div className="mt-1 flex flex-wrap gap-1">
                {selected.issues.map((i) => (
                  <Badge key={i} tone="muted">
                    {ISSUE_LABELS[i] || i}
                  </Badge>
                ))}
              </div>
            </div>
            <p>
              <b>Comentario:</b>
              <br />
              {selected.comment || "—"}
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border p-3">
                <b>Texto que vio el usuario</b>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {selected.generatedText || "—"}
                </p>
              </div>
              <div className="rounded border p-3">
                <b>Descripción actual</b>
                <p className="mt-2 whitespace-pre-wrap text-muted-foreground">
                  {selected.currentText || "—"}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
