"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Cable, Loader2 } from "lucide-react";

type Suggestion = {
  id: string;
  reason: string;
  severity: "required" | "recommended";
  productId: string;
  name: string;
  brand: string | null;
  sku: string | null;
  kind: string;
  quantity: number;
  alreadyInProject: boolean;
};

export function InterconnectPanel({
  projectId,
  onUpdated,
}: {
  projectId: string;
  onUpdated: () => void;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [platform, setPlatform] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, startTransition] = useTransition();

  async function load() {
    const res = await fetch(
      `/api/admin/room-builder/projects/${projectId}/interconnect`,
    );
    const json = await res.json();
    if (!json.ok) return;
    setPlatform(json.platform);
    setItems(json.suggestions ?? []);
    const required = new Set<string>(
      (json.suggestions as Suggestion[])
        .filter((s) => !s.alreadyInProject && s.severity === "required")
        .map((s) => s.productId),
    );
    setSelected(required);
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function apply() {
    if (selected.size === 0) {
      toast.message("Elegí al menos un producto de la cadena");
      return;
    }
    startTransition(async () => {
      const res = await fetch(
        `/api/admin/room-builder/projects/${projectId}/interconnect`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ productIds: [...selected] }),
        },
      );
      const json = await res.json();
      if (!json.ok) {
        toast.error(json.error || "No se pudo aplicar");
        return;
      }
      toast.success(`Cadena: +${json.added} productos`);
      setItems(json.analysis?.suggestions ?? []);
      onUpdated();
    });
  }

  const missing = items.filter((i) => !i.alreadyInProject);

  return (
    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <Cable className="h-4 w-4 text-amber-700" />
        Cadena Crestron / deps
      </div>
      <p className="text-[11px] text-slate-600">
        Plataforma: <strong>{platform || "—"}</strong>. Detecta procesadores,
        teclas, accesorios incluidos y compatibles del catálogo (como el Room
        Builder de Crestron).
      </p>

      {missing.length === 0 ? (
        <p className="text-[11px] text-emerald-700">
          Sin pendientes críticos en la cadena.
        </p>
      ) : (
        <div className="max-h-44 space-y-1.5 overflow-y-auto">
          {missing.map((s) => (
            <label
              key={s.id}
              className="flex cursor-pointer gap-2 rounded-lg border border-amber-100 bg-white p-2 text-[11px]"
            >
              <input
                type="checkbox"
                checked={selected.has(s.productId)}
                onChange={() => toggle(s.productId)}
                className="mt-0.5"
              />
              <span>
                <span
                  className={`mr-1 rounded px-1 py-0.5 text-[10px] font-semibold ${
                    s.severity === "required"
                      ? "bg-red-100 text-red-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {s.severity === "required" ? "Requerido" : "Sugerido"}
                </span>
                <span className="font-medium text-slate-900">
                  {s.brand ? `${s.brand} · ` : ""}
                  {s.name}
                </span>
                <span className="mt-0.5 block text-slate-500">{s.reason}</span>
              </span>
            </label>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() => void load()}
          className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-[11px] font-medium"
        >
          Reanalizar
        </button>
        <button
          type="button"
          disabled={pending || selected.size === 0}
          onClick={apply}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1.5 text-[11px] font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Agregar seleccionados al BOM
        </button>
      </div>
    </div>
  );
}
