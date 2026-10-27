"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { approveBranchAction, loadTangoProposalsAction, rejectBranchAction } from "@/server/actions/category-proposals";

export type BranchRow = {
  id: string;
  path: string;
  parent: string;
  name: string;
  reason: string | null;
  count: number;
  examples: string[];
  status: "PENDING" | "APPROVED" | "REJECTED";
};

/**
 * Rubros que el árbol de Tango no tiene y convendría crear. Aprobar uno crea el
 * rubro y pasa ahí a sus productos (las propuestas quedan para aprobar).
 */
export function BranchSuggestions({ rows, canLoad }: { rows: BranchRow[]; canLoad: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const run = (action: () => Promise<{ ok: boolean; error?: string; message?: string }>) =>
    start(async () => {
      const r = await action();
      if (!r.ok) return void toast.error(r.error || "No se pudo hacer.");
      toast.success(r.message || "Listo.");
      router.refresh();
    });
  const open = rows.filter((r) => r.status === "PENDING");

  if (!rows.length) {
    return canLoad ? (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 text-sm">
        <span>Hay rubros nuevos sugeridos para el árbol que todavía no se cargaron.</span>
        <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => run(() => loadTangoProposalsAction())}>
          Cargar rubros sugeridos
        </Button>
      </div>
    ) : null;
  }

  return (
    <details className="rounded-lg border border-border bg-card" open={open.length > 0}>
      <summary className="cursor-pointer px-4 py-3">
        <span className="font-medium">Rubros nuevos sugeridos</span>{" "}
        <span className="text-sm text-muted-foreground">
          {open.length} para decidir · faltan en el árbol de Tango; si los aprobás, creálos igual en Tango
        </span>
      </summary>
      <ul className="divide-y divide-border border-t border-border">
        {rows.map((b) => (
          <li key={b.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0 space-y-1">
              <p className="text-sm">
                <span className="text-muted-foreground">{b.parent} › </span>
                <b>{b.name}</b>
              </p>
              <p className="font-mono text-xs text-muted-foreground">{b.path}</p>
              {b.reason ? <p className="text-sm">{b.reason}</p> : null}
              <p className="text-xs text-muted-foreground">
                {b.count} productos{b.examples.length ? `: ${b.examples.join(", ")}${b.count > b.examples.length ? "…" : ""}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-2 sm:justify-end">
              {b.status === "PENDING" ? (
                <>
                  <Button type="button" size="sm" disabled={pending} onClick={() => run(() => approveBranchAction({ id: b.id }))}>
                    Crear y mover sus productos
                  </Button>
                  <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => run(() => rejectBranchAction({ id: b.id }))}>
                    Descartar
                  </Button>
                </>
              ) : (
                <Badge tone={b.status === "APPROVED" ? "success" : "muted"}>{b.status === "APPROVED" ? "Creado" : "Descartado"}</Badge>
              )}
            </div>
          </li>
        ))}
      </ul>
    </details>
  );
}
