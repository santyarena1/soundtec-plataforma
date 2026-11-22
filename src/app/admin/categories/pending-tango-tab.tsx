"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { markTangoLoadedAction } from "@/server/actions/rubros-admin";

export interface PendingTangoRow {
  id: string;
  path: string;
  tangoPath: string;
  products: number;
  createdBy: string | null;
  createdAt: string | null;
}

/** Rubros creados o renombrados en la app que todavía hay que cargar a mano en Tango. */
export function PendingTangoTab({ rows }: { rows: PendingTangoRow[] }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm text-muted-foreground">
          Tango no tiene una forma de recibirlos solos: cargalos a mano con la misma ruta y después marcalos «Ya está en Tango». El CSV tiene
          las mismas 4 columnas que el que exporta Tango (Rubro; Subrubro; Nivel 3; Nivel 4).
        </p>
        <ButtonLink href="/api/admin/rubros/pendientes-tango" variant="outline">
          <Download className="h-4 w-4" /> Exportar CSV
        </ButtonLink>
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay rubros pendientes de cargar en Tango.</p>
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{r.path}</p>
                <p className="text-xs text-muted-foreground">
                  En Tango: {r.tangoPath} · {r.products} producto{r.products === 1 ? "" : "s"}
                  {r.createdBy ? ` · ${r.createdBy}` : ""}
                  {r.createdAt ? ` · ${new Date(r.createdAt).toLocaleDateString("es-AR")}` : ""}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  start(async () => {
                    const res = await markTangoLoadedAction(r.id);
                    if (!res.ok) toast.error(res.error);
                    else toast.success("Marcado como cargado en Tango.");
                    router.refresh();
                  })
                }
              >
                Ya está en Tango
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
