"use client";

/** Ambientes de un proyecto contenedor: entrar a cada uno o eliminarlo. */

import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";
import { getRoomTemplate } from "@/services/room-builder/templates";

export type HubSpace = { id: string; name: string; templateKey: string; unitCount: number; status: string; _count: { devices: number } };

const STATUS_LABELS: Record<string, string> = { draft: "Borrador", ready: "Listo", quoted: "Cotizado" };

export function HubSpaces({ spaces, onDeleted }: { spaces: HubSpace[]; onDeleted: (id: string) => void }) {
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/admin/room-builder/projects/${id}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) {
        toast.error(json?.error || "No se pudo eliminar el ambiente");
        return;
      }
      onDeleted(id);
      toast.success("Ambiente eliminado");
    } catch {
      toast.error("No se pudo eliminar el ambiente");
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  if (!spaces.length) {
    return <p className="rounded-xl border border-dashed border-slate-300 bg-white p-6 text-center text-sm text-slate-500">Este proyecto ya no tiene ambientes.</p>;
  }

  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {spaces.map((space) => {
        const template = getRoomTemplate(space.templateKey);
        const confirming = confirmId === space.id;
        const deleting = deletingId === space.id;
        return (
          <li key={space.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-slate-900">{space.name}</p>
              <p className="text-xs text-slate-500">
                {template?.name ?? space.templateKey}
                {space.unitCount > 1 ? ` · ×${space.unitCount}` : ""} · {space._count.devices} equipos · {STATUS_LABELS[space.status] ?? space.status}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {confirming ? (
                <>
                  <span className="text-xs font-medium text-red-700">¿Eliminar este ambiente y sus equipos?</span>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={() => remove(space.id)}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-60"
                  >
                    {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />} Eliminar
                  </button>
                  <button type="button" disabled={deleting} onClick={() => setConfirmId(null)} className="rounded-lg px-2 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100">
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <Link href={`/admin/room-builder/${space.id}`} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium hover:bg-slate-50">
                    Entrar al espacio
                  </Link>
                  <button
                    type="button"
                    onClick={() => setConfirmId(space.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Eliminar ambiente"
                    aria-label={`Eliminar ${space.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
