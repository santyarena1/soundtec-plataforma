"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, GitMerge, Pencil, Plus, Search, Trash2, UserMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Modal } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import {
  createSeries,
  deleteEmptySeries,
  listSeriesProducts,
  markSeriesReviewed,
  mergeSeries,
  removeProductsFromSeries,
  renameSeries,
} from "@/server/actions/product-lines";
import { SERIES_SOURCE_LABEL } from "./source-label";

export type SeriesRow = { id: string; name: string; source: keyof typeof SERIES_SOURCE_LABEL; isReviewed: boolean; products: number };
export type SeriesBrandGroup = { brandId: string; brand: string; withoutSeries: number; series: SeriesRow[] };

type Dialog =
  | { kind: "rename"; row: SeriesRow }
  | { kind: "merge"; row: SeriesRow; group: SeriesBrandGroup }
  | { kind: "remove"; row: SeriesRow }
  | null;

export function SeriesReview({ groups, brands }: { groups: SeriesBrandGroup[]; brands: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "destructive"; text: string } | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string; message?: string }>, after?: () => void) =>
    startTransition(async () => {
      const r = await fn();
      setNotice(r.ok ? (r.message ? { tone: "success", text: r.message } : null) : { tone: "destructive", text: r.error ?? "No se pudo." });
      if (r.ok) {
        after?.();
        router.refresh();
      }
    });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return groups
      .map((g) => ({
        ...g,
        series: g.series.filter((s) => (!onlyPending || !s.isReviewed) && (!q || s.name.toLowerCase().includes(q) || g.brand.toLowerCase().includes(q))),
      }))
      .filter((g) => g.series.length > 0);
  }, [groups, query, onlyPending]);

  const totals = useMemo(() => {
    const all = groups.flatMap((g) => g.series);
    return { series: all.length, pending: all.filter((s) => !s.isReviewed).length, products: all.reduce((n, s) => n + s.products, 0) };
  }, [groups]);

  return (
    <div className="space-y-5">
      <Card>
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="heading-3">Series del fabricante</h2>
              <p className="text-sm text-muted-foreground">
                La colección comercial de cada marca (Horizon, Landscape, CBL…). Se usa en la tarjeta del catálogo, en «Más de la serie», en el filtro de la
                marca y en el Room Builder. Los nombres son de la marca: no se traducen.
              </p>
            </div>
            <p className="text-sm text-muted-foreground">
              {totals.series} series · {totals.products} productos · <strong className="text-foreground">{totals.pending} sin revisar</strong>
            </p>
          </div>
          <CreateSeriesForm brands={brands} pending={pending} onCreate={(brandId, name) => run(() => createSeries(brandId, name))} />
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar serie o marca" className="pl-8" aria-label="Buscar serie o marca" />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />
              Solo sin revisar
            </label>
          </div>
          {notice ? (
            <p role="status" className={notice.tone === "success" ? "text-sm text-success" : "text-sm text-destructive"}>
              {notice.text}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {visible.length === 0 ? <p className="text-sm text-muted-foreground">No hay series para mostrar.</p> : null}

      {visible.map((g) => (
        <section key={g.brandId} aria-labelledby={`serie-${g.brandId}`} className="space-y-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 id={`serie-${g.brandId}`} className="text-base font-semibold">
              {g.brand} <span className="font-normal text-muted-foreground">· {g.series.length} series</span>
            </h3>
            {g.withoutSeries ? (
              <Link href={`/admin/products?brand=${g.brandId}&line=none`} className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                {g.withoutSeries} productos sin serie
              </Link>
            ) : null}
          </div>
          <Table>
            <THead>
              <TR>
                <TH>Serie</TH>
                <TH className="w-24 text-right">Productos</TH>
                <TH>Origen</TH>
                <TH className="text-right">Acciones</TH>
              </TR>
            </THead>
            <TBody>
              {g.series.map((s) => (
                <TR key={s.id}>
                  <TD>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{s.name}</span>
                      {s.isReviewed ? <Badge tone="success">Revisada</Badge> : <Badge tone="warning">Sin revisar</Badge>}
                    </div>
                  </TD>
                  <TD className="text-right tabular-nums">
                    <Link href={`/admin/products?line=${s.id}`} className="underline-offset-2 hover:underline">
                      {s.products}
                    </Link>
                  </TD>
                  <TD className="text-sm text-muted-foreground">{SERIES_SOURCE_LABEL[s.source]}</TD>
                  <TD>
                    <div className="flex flex-wrap justify-end gap-1.5">
                      {!s.isReviewed ? (
                        <Button size="sm" variant="subtle" disabled={pending} onClick={() => run(() => markSeriesReviewed(s.id, true))}>
                          <Check className="h-3.5 w-3.5" /> Está bien
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "rename", row: s })}>
                        <Pencil className="h-3.5 w-3.5" /> Renombrar
                      </Button>
                      {g.series.length > 1 ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "merge", row: s, group: g })}>
                          <GitMerge className="h-3.5 w-3.5" /> Unir con…
                        </Button>
                      ) : null}
                      {s.products > 0 ? (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDialog({ kind: "remove", row: s })}>
                          <UserMinus className="h-3.5 w-3.5" /> Quitar productos
                        </Button>
                      ) : (
                        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(() => deleteEmptySeries(s.id))}>
                          <Trash2 className="h-3.5 w-3.5" /> Borrar
                        </Button>
                      )}
                    </div>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </section>
      ))}

      {dialog?.kind === "rename" ? (
        <RenameDialog row={dialog.row} pending={pending} onClose={() => setDialog(null)} onSave={(name) => run(() => renameSeries(dialog.row.id, name), () => setDialog(null))} />
      ) : null}
      {dialog?.kind === "merge" ? (
        <MergeDialog
          row={dialog.row}
          group={dialog.group}
          pending={pending}
          onClose={() => setDialog(null)}
          onMerge={(intoId) => run(() => mergeSeries(dialog.row.id, intoId), () => setDialog(null))}
        />
      ) : null}
      {dialog?.kind === "remove" ? (
        <RemoveProductsDialog
          row={dialog.row}
          pending={pending}
          onClose={() => setDialog(null)}
          onRemove={(ids) => run(() => removeProductsFromSeries(dialog.row.id, ids), () => setDialog(null))}
        />
      ) : null}
    </div>
  );
}

function CreateSeriesForm({ brands, pending, onCreate }: { brands: Array<{ id: string; name: string }>; pending: boolean; onCreate: (brandId: string, name: string) => void }) {
  const [brandId, setBrandId] = useState("");
  const [name, setName] = useState("");
  return (
    <form
      className="grid gap-2 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        if (!brandId || !name.trim()) return;
        onCreate(brandId, name);
        setName("");
      }}
    >
      <div>
        <Label htmlFor="series-brand">Marca</Label>
        <Select id="series-brand" value={brandId} onChange={(e) => setBrandId(e.target.value)}>
          <option value="">Elegí la marca</option>
          {brands.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="series-name">Nueva serie</Label>
        <Input id="series-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Como la escribe la marca: Landscape, DM NVX…" maxLength={60} />
      </div>
      <Button type="submit" disabled={pending || !brandId || !name.trim()}>
        <Plus className="h-4 w-4" /> Crear
      </Button>
    </form>
  );
}

function RenameDialog({ row, pending, onClose, onSave }: { row: SeriesRow; pending: boolean; onClose: () => void; onSave: (name: string) => void }) {
  const [name, setName] = useState(row.name);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Renombrar «${row.name}»`}
      description="Escribila como la marca (sin «Series»). Queda marcada como revisada."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !name.trim() || name.trim() === row.name} onClick={() => onSave(name)}>
            Guardar
          </Button>
        </>
      }
    >
      <Label htmlFor="rename-series">Nombre</Label>
      <Input id="rename-series" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
    </Modal>
  );
}

function MergeDialog({ row, group, pending, onClose, onMerge }: { row: SeriesRow; group: SeriesBrandGroup; pending: boolean; onClose: () => void; onMerge: (intoId: string) => void }) {
  const [intoId, setIntoId] = useState("");
  const options = group.series.filter((s) => s.id !== row.id);
  return (
    <Modal
      open
      onClose={onClose}
      title={`Unir «${row.name}» con otra serie`}
      description={`Sus ${row.products} productos pasan a la serie elegida y «${row.name}» desaparece.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={pending || !intoId} onClick={() => onMerge(intoId)}>
            Unir
          </Button>
        </>
      }
    >
      <Label htmlFor="merge-into">Serie de {group.brand}</Label>
      <Select id="merge-into" value={intoId} onChange={(e) => setIntoId(e.target.value)}>
        <option value="">Elegí la serie</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({s.products})
          </option>
        ))}
      </Select>
    </Modal>
  );
}

function RemoveProductsDialog({ row, pending, onClose, onRemove }: { row: SeriesRow; pending: boolean; onClose: () => void; onRemove: (ids: string[]) => void }) {
  const [items, setItems] = useState<Array<{ id: string; name: string; model: string | null; isActive: boolean }> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    let alive = true;
    listSeriesProducts(row.id)
      .then((r) => alive && setItems(r))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [row.id]);
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <Modal
      open
      size="lg"
      onClose={onClose}
      title={`Quitar productos de «${row.name}»`}
      description="Los elegidos quedan sin serie y el llenado automático no se la vuelve a poner."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button variant="destructive" disabled={pending || selected.size === 0} onClick={() => onRemove([...selected])}>
            Quitar {selected.size || ""}
          </Button>
        </>
      }
    >
      {items === null ? (
        <p className="text-sm text-muted-foreground">Cargando productos…</p>
      ) : (
        <ul className="max-h-[50vh] divide-y divide-border overflow-y-auto rounded-md border border-border">
          {items.map((p) => (
            <li key={p.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-secondary">
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                <span className="font-mono text-xs text-muted-foreground">{p.model ?? "—"}</span>
                <span className="flex-1">{p.name}</span>
                {!p.isActive ? <Badge tone="muted">Inactivo</Badge> : null}
              </label>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
