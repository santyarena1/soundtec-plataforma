"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { RubroPicker } from "@/components/admin/rubro-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { EQUIVALENCE_SOURCES, EQUIVALENCE_SOURCE_LABEL } from "@/lib/category-equivalence";
import {
  confirmEquivalenceAction,
  deleteEquivalenceAction,
  saveEquivalenceAction,
  suggestEquivalencesAction,
} from "@/server/actions/rubros-admin";

export interface EquivalenceRow {
  id: string;
  source: string;
  brandId: string | null;
  brandName: string | null;
  sourceLabel: string;
  categoryId: string;
  categoryPath: string;
  status: string;
  sampleCount: number;
  sampleShare: number | null;
}

/** «Categoría del proveedor → rubro»: lo usan importadores, sincronizaciones y la IA para ubicar productos nuevos. */
export function EquivalencesTab({
  rows,
  nodes,
  brands,
}: {
  rows: EquivalenceRow[];
  nodes: CategoryNode[];
  brands: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [filter, setFilter] = useState<"all" | "SUGGESTED" | "ACTIVE">("all");
  const [q, setQ] = useState("");
  const [form, setForm] = useState({ source: "*", brandId: "", sourcePath: "", categoryId: "" });
  const [formKey, setFormKey] = useState(0);

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (filter === "all" || r.status === filter) &&
        (!needle || `${r.sourceLabel} ${r.brandName ?? ""} ${r.categoryPath}`.toLowerCase().includes(needle))
    );
  }, [rows, filter, q]);
  const suggested = rows.filter((r) => r.status === "SUGGESTED").length;

  function run(task: () => Promise<{ ok: boolean; error?: string }>, okText: string, after?: () => void) {
    start(async () => {
      const r = await task();
      if (!r.ok) {
        toast.error(r.error ?? "No se pudo.");
        return;
      }
      toast.success(okText);
      after?.();
      router.refresh();
    });
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        Cuando un importador o una sincronización trae un producto nuevo, busca acá su categoría del proveedor (por fuente y marca) y lo
        ubica en ese rubro. Si no hay equivalencia, el producto entra en «Sin rubro» para ubicarlo a mano. Las <b>sugeridas</b> salieron de
        productos ya ubicados (misma ruta del proveedor → mismo rubro en al menos el 90 % de los casos y 3 productos): se usan igual, pero conviene
        confirmarlas.
      </p>

      <section className="space-y-3 rounded-lg border border-border bg-card p-4" aria-label="Nueva equivalencia">
        <h2 className="font-medium">Nueva equivalencia</h2>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <Label>Fuente</Label>
            <Select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
              {EQUIVALENCE_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {EQUIVALENCE_SOURCE_LABEL[s] ?? s}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Marca</Label>
            <Select value={form.brandId} onChange={(e) => setForm({ ...form, brandId: e.target.value })}>
              <option value="">Todas</option>
              {brands.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoría o ruta del proveedor</Label>
            <Input value={form.sourcePath} onChange={(e) => setForm({ ...form, sourcePath: e.target.value })} placeholder="Tal cual la trae (ej. Pendant Speakers)" />
          </div>
          <div>
            <Label>Rubro</Label>
            <RubroPicker key={formKey} nodes={nodes} allowEmpty={false} onChange={(id) => setForm((f) => ({ ...f, categoryId: id }))} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            disabled={busy || !form.sourcePath.trim() || !form.categoryId}
            onClick={() =>
              run(() => saveEquivalenceAction({ ...form, brandId: form.brandId || null }), "Equivalencia guardada.", () => {
                setForm({ source: form.source, brandId: form.brandId, sourcePath: "", categoryId: "" });
                setFormKey((k) => k + 1);
              })
            }
          >
            Guardar
          </Button>
          <Button
            variant="outline"
            disabled={busy}
            onClick={() =>
              start(async () => {
                const r = await suggestEquivalencesAction();
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(r.created ? `Se sugirieron ${r.created} equivalencias nuevas.` : "No hay equivalencias nuevas para sugerir.");
                router.refresh();
              })
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            Sugerir desde productos ya ubicados
          </Button>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "SUGGESTED", "ACTIVE"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-full border px-3 py-1 text-xs ${filter === f ? "border-primary bg-primary text-primary-foreground" : "border-border"}`}
          >
            {f === "all" ? `Todas (${rows.length})` : f === "SUGGESTED" ? `Sugeridas para revisar (${suggested})` : `Confirmadas (${rows.length - suggested})`}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ruta, marca o rubro" className="h-8 max-w-xs text-sm" />
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay equivalencias con ese filtro.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Fuente · marca</th>
                <th className="px-3 py-2">Ruta del proveedor</th>
                <th className="px-3 py-2">Rubro</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} className="border-t border-border align-top">
                  <td className="px-3 py-2 text-xs">
                    {EQUIVALENCE_SOURCE_LABEL[r.source] ?? r.source}
                    <br />
                    <span className="text-muted-foreground">{r.brandName ?? "Todas las marcas"}</span>
                  </td>
                  <td className="px-3 py-2">{r.sourceLabel}</td>
                  <td className="min-w-[16rem] px-3 py-2">
                    <RubroPicker
                      nodes={nodes}
                      allowEmpty={false}
                      defaultValue={r.categoryId}
                      onChange={(id) =>
                        id && id !== r.categoryId
                          ? run(() => saveEquivalenceAction({ id: r.id, source: r.source, brandId: r.brandId, sourcePath: r.sourceLabel, categoryId: id }), "Rubro cambiado.")
                          : undefined
                      }
                    />
                  </td>
                  <td className="px-3 py-2">
                    {r.status === "SUGGESTED" ? (
                      <div className="space-y-1">
                        <Badge tone="warning">Sugerida</Badge>
                        <p className="text-xs text-muted-foreground">
                          {r.sampleCount} productos{r.sampleShare != null ? ` · ${Math.round(r.sampleShare * 100)} %` : ""}
                        </p>
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => confirmEquivalenceAction(r.id), "Confirmada.")}>
                          Está bien
                        </Button>
                      </div>
                    ) : (
                      <Badge tone="success">Confirmada</Badge>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      type="button"
                      aria-label="Borrar equivalencia"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busy}
                      onClick={() => {
                        if (window.confirm("¿Borrar esta equivalencia? Los productos nuevos de esa ruta van a ir a «Sin rubro».")) run(() => deleteEquivalenceAction(r.id), "Borrada.");
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
