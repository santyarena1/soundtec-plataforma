"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ClientFormModal } from "@/components/admin/client-form-modal";
import { deleteClient, toggleClientActive } from "@/server/actions/clients";

export interface ClientRowData {
  id: string;
  companyName: string;
  tradeName?: string | null;
  taxId?: string | null;
  segment?: string | null;
  ownerId?: string | null;
  website?: string | null;
  address?: string | null;
  city?: string | null;
  province?: string | null;
  country?: string | null;
  source?: string | null;
  notes?: string | null;
  assignedPriceListId?: string | null;
  tags?: string[];
  isActive: boolean;
  /** Pedidos + cotizaciones + movimientos: si hay historial no se puede borrar, solo desactivar. */
  historyCount: number;
}

interface Props {
  client: ClientRowData;
  owners: { id: string; name: string }[];
  priceLists: { id: string; name: string }[];
}

/** Acciones por fila en la lista de clientes: editar, activar/desactivar, eliminar. */
export function ClientRowActions({ client, owners, priceLists }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const canDelete = client.historyCount === 0;

  function run(action: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    start(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "No se pudo completar la acción.");
        return;
      }
      setOpen(false);
      setConfirmDelete(false);
      router.refresh();
    });
  }

  return (
    <div className="relative flex items-center justify-end gap-1">
      <ClientFormModal owners={owners} priceLists={priceLists} client={client} triggerLabel="Editar" />
      <Button
        type="button"
        size="sm"
        variant="ghost"
        aria-label="Más acciones"
        onClick={() => setOpen((v) => !v)}
        disabled={pending}
      >
        <MoreHorizontal className="h-4 w-4" />
      </Button>
      {open ? (
        <>
          <button type="button" className="fixed inset-0 z-10 cursor-default" aria-label="Cerrar" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-9 z-20 w-56 rounded-md border border-border bg-card p-1 text-sm shadow-elevated">
            <button
              type="button"
              className="block w-full rounded px-3 py-2 text-left hover:bg-secondary"
              onClick={() => {
                const fd = new FormData();
                fd.set("id", client.id);
                run(() => toggleClientActive(fd));
              }}
            >
              {client.isActive ? "Desactivar cliente" : "Activar cliente"}
            </button>
            <button
              type="button"
              className="block w-full rounded px-3 py-2 text-left text-destructive hover:bg-destructive/10 disabled:opacity-50"
              disabled={!canDelete}
              title={canDelete ? "" : "Tiene pedidos, cotizaciones o movimientos: desactivalo en vez de borrarlo."}
              onClick={() => {
                setOpen(false);
                setConfirmDelete(true);
              }}
            >
              Eliminar cliente
            </button>
            {!canDelete ? (
              <p className="px-3 pb-2 pt-1 text-[11px] text-muted-foreground">
                Con historial no se puede eliminar; podés desactivarlo.
              </p>
            ) : null}
            {error ? <p className="px-3 pb-2 text-[11px] text-destructive">{error}</p> : null}
          </div>
        </>
      ) : null}
      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        pending={pending}
        tone="destructive"
        title={`¿Eliminar a ${client.companyName}?`}
        description="Se borran también sus contactos, actividad y usuarios del portal. Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        onConfirm={() => {
          const fd = new FormData();
          fd.set("id", client.id);
          run(() => deleteClient(fd));
        }}
      />
    </div>
  );
}
