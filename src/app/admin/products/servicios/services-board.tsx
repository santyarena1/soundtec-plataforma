"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CategoryTreePicker } from "@/components/admin/category-tree-picker";
import type { CategoryNode } from "@/lib/category-tree";
import { createQuoteService, updateQuoteService, type QuoteServiceInput } from "@/server/actions/quote-services";

export type ServiceRow = {
  id: string;
  name: string;
  description: string | null;
  priceUsd: number | null;
  ivaPercent: number;
  categoryId: string | null;
  categoryLabel: string | null;
  isActive: boolean;
};

type Draft = { name: string; description: string; price: string; ivaPercent: string; categoryId: string; isActive: boolean };
const usd = (n: number) => `USD ${n.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const toDraft = (r?: ServiceRow): Draft => ({
  name: r?.name ?? "",
  description: r?.description ?? "",
  price: r?.priceUsd == null ? "" : String(r.priceUsd),
  ivaPercent: String(r?.ivaPercent ?? 21),
  categoryId: r?.categoryId ?? "",
  isActive: r?.isActive ?? true,
});

/** Lista de servicios: se busca, se edita en el lugar y se agregan nuevos. */
export function ServicesBoard({ rows, nodes }: { rows: ServiceRow[]; nodes: CategoryNode[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(toDraft());

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? rows.filter((r) => `${r.name} ${r.description ?? ""} ${r.categoryLabel ?? ""}`.toLowerCase().includes(t)) : rows;
  }, [q, rows]);

  function open(r?: ServiceRow) {
    setEditing(r?.id ?? "nuevo");
    setDraft(toDraft(r));
  }

  function save() {
    const price = draft.price.trim().replace(",", ".");
    const input: QuoteServiceInput = {
      name: draft.name,
      description: draft.description.trim() || null,
      priceUsd: price === "" ? null : Number(price),
      ivaPercent: Number(draft.ivaPercent),
      categoryId: draft.categoryId || null,
      isActive: draft.isActive,
    };
    if (input.priceUsd != null && !Number.isFinite(input.priceUsd)) return void toast.error("El precio tiene que ser un número.");
    start(async () => {
      const r = editing === "nuevo" ? await createQuoteService(input) : await updateQuoteService(editing!, input);
      if (!r.ok) return void toast.error(r.error || "No se pudo guardar.");
      toast.success(r.message || "Guardado.");
      setEditing(null);
      router.refresh();
    });
  }

  const form = (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4">
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_10rem_8rem]">
        <div>
          <Label htmlFor="svc-name">Nombre</Label>
          <Input id="svc-name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="Ej. VTE CABA ING 1H - NORMAL" />
        </div>
        <div>
          <Label htmlFor="svc-price">Precio de venta USD</Label>
          <Input id="svc-price" inputMode="decimal" value={draft.price} onChange={(e) => setDraft({ ...draft, price: e.target.value })} placeholder="Vacío = se carga al cotizar" />
        </div>
        <div>
          <Label htmlFor="svc-iva">IVA</Label>
          <Select id="svc-iva" value={draft.ivaPercent} onChange={(e) => setDraft({ ...draft, ivaPercent: e.target.value })}>
            <option value="21">21%</option>
            <option value="10.5">10,5%</option>
            <option value="0">Sin IVA</option>
          </Select>
        </div>
      </div>
      <div>
        <Label htmlFor="svc-desc">Detalle (sale completo en la cotización)</Label>
        <Textarea id="svc-desc" rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
      </div>
      {nodes.length ? (
        <div>
          <Label>Rubro</Label>
          <CategoryTreePicker nodes={nodes} name="svc-category" defaultValue={draft.categoryId} onChange={(id) => setDraft((d) => ({ ...d, categoryId: id }))} />
        </div>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={draft.isActive} onChange={(e) => setDraft({ ...draft, isActive: e.target.checked })} />
        Se puede usar al cotizar
      </label>
      <div className="flex gap-2">
        <Button type="button" onClick={save} disabled={pending || draft.name.trim().length < 2}>
          {editing === "nuevo" ? "Agregar servicio" : "Guardar"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setEditing(null)} disabled={pending}>Cancelar</Button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar servicio" aria-label="Buscar servicio" className="w-72" />
        <Button type="button" variant="outline" size="sm" onClick={() => open()} disabled={pending}>
          <Plus className="h-4 w-4" /> Nuevo servicio
        </Button>
      </div>
      {editing === "nuevo" ? form : null}
      <p className="text-sm text-muted-foreground tabular-nums">{shown.length} servicios</p>
      <ul className="divide-y divide-border rounded-lg border border-border bg-card">
        {shown.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="p-3">{form}</li>
          ) : (
            <li key={r.id} className={`flex flex-wrap items-start justify-between gap-3 px-4 py-3 ${r.isActive ? "" : "opacity-60"}`}>
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="font-medium">{r.name}</p>
                {r.description ? <p className="text-sm text-muted-foreground">{r.description}</p> : null}
                <p className="text-xs text-muted-foreground">
                  {r.categoryLabel ?? "Sin rubro"} · IVA {String(r.ivaPercent).replace(".", ",")}%
                  {r.isActive ? "" : " · No se usa"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                {r.priceUsd == null ? <Badge tone="warning">Sin precio</Badge> : <span className="font-semibold tabular-nums">{usd(r.priceUsd)}</span>}
                <Button type="button" size="sm" variant="outline" onClick={() => open(r)} disabled={pending}>Editar</Button>
              </div>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
