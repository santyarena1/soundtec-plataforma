"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Select, Input } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";
import { bulkUpdateProducts } from "@/server/actions/admin-catalog";
import { bulkGenerateDescriptions, bulkSearchImages } from "@/server/actions/product-enrichment";
import { Loader2, Sparkles, ImageIcon } from "lucide-react";

interface ProductRow {
  id: string;
  sku: string;
  name: string;
  brand: string | null;
  category: string | null;
  cost: number;
  stockStatus: string;
  discountPercent: number | null;
  isActive: boolean;
}

interface Props {
  products: ProductRow[];
  brands: { id: string; name: string }[];
  categories: { id: string; name: string }[];
}

export function ProductsBulkBar({ products, brands, categories }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<string>("activate");
  const [brandId, setBrandId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [discount, setDiscount] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected((s) =>
      s.size === products.length ? new Set() : new Set(products.map((p) => p.id))
    );
  }

  function applyBulk() {
    if (selected.size === 0) return;
    if (!window.confirm(`Aplicar "${action}" a ${selected.size} producto(s)?`)) return;
    setMsg(null);
    start(async () => {
      const result = await bulkUpdateProducts({
        productIds: [...selected],
        action: action as any,
        brandId: brandId || null,
        categoryId: categoryId || null,
        discountPercent: discount ? Number(discount) : null,
      });
      if (result?.ok) {
        setMsg(`Aplicado a ${selected.size} producto(s).`);
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg(result?.error || "Error");
      }
    });
  }

  function aiDescribe() {
    if (selected.size === 0) return;
    if (!window.confirm(`Generar descripciones IA para ${selected.size} producto(s)? Esto puede consumir tokens.`)) return;
    setMsg(null);
    start(async () => {
      const r = await bulkGenerateDescriptions([...selected]);
      setMsg(r.ok ? `Descripciones generadas: ${r.processed} (errores: ${r.errors})` : "Error en generación masiva");
      setSelected(new Set());
      router.refresh();
    });
  }

  function bulkImages() {
    if (selected.size === 0) return;
    if (!window.confirm(`Buscar y adjuntar imagen Serper para ${selected.size} producto(s) sin imágenes?`)) return;
    setMsg(null);
    start(async () => {
      const r = await bulkSearchImages([...selected]);
      setMsg(r.ok ? `Imágenes adjuntadas: ${r.processed} (omitidos: ${r.skipped})` : "Error en búsqueda masiva");
      setSelected(new Set());
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2 rounded-md border border-border bg-card p-3">
        <div className="text-sm">
          <span className="font-medium">{selected.size}</span> seleccionado(s)
        </div>
        <Select value={action} onChange={(e) => setAction(e.target.value)} className="h-9 w-44 text-xs">
          <option value="activate">Activar</option>
          <option value="deactivate">Desactivar</option>
          <option value="set_brand">Asignar marca</option>
          <option value="set_category">Asignar categoría</option>
          <option value="set_discount">Aplicar descuento %</option>
        </Select>
        {action === "set_brand" ? (
          <Select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="h-9 w-44 text-xs">
            <option value="">Sin marca</option>
            {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        ) : null}
        {action === "set_category" ? (
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="h-9 w-44 text-xs">
            <option value="">Sin categoría</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        ) : null}
        {action === "set_discount" ? (
          <Input
            type="number"
            value={discount}
            onChange={(e) => setDiscount(e.target.value)}
            min={0}
            max={100}
            step="0.1"
            placeholder="%"
            className="h-9 w-24"
          />
        ) : null}
        <Button onClick={applyBulk} disabled={pending || selected.size === 0} size="sm">
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Aplicar
        </Button>
        <Button onClick={aiDescribe} disabled={pending || selected.size === 0} size="sm" variant="outline">
          <Sparkles className="h-3.5 w-3.5" /> Descripciones IA
        </Button>
        <Button onClick={bulkImages} disabled={pending || selected.size === 0} size="sm" variant="outline">
          <ImageIcon className="h-3.5 w-3.5" /> Imágenes Serper
        </Button>
        {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
      </div>

      <Table>
        <THead>
          <TR>
            <TH className="w-10">
              <input
                type="checkbox"
                checked={selected.size === products.length && products.length > 0}
                onChange={toggleAll}
              />
            </TH>
            <TH>Producto</TH>
            <TH>Marca</TH>
            <TH>Categoría</TH>
            <TH>Costo USD</TH>
            <TH>Desc.</TH>
            <TH>Stock</TH>
            <TH>Activo</TH>
            <TH></TH>
          </TR>
        </THead>
        <TBody>
          {products.map((p) => (
            <TR key={p.id}>
              <TD>
                <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
              </TD>
              <TD>
                <Link href={`/admin/products/${p.id}`} className="hover:underline">
                  {p.name}
                </Link>
                <p className="text-xs text-muted-foreground">{p.sku}</p>
              </TD>
              <TD>{p.brand || "—"}</TD>
              <TD>{p.category || "—"}</TD>
              <TD>{formatUsd(p.cost)}</TD>
              <TD>{p.discountPercent ? `${p.discountPercent}%` : "—"}</TD>
              <TD><Badge tone="muted">{p.stockStatus}</Badge></TD>
              <TD>{p.isActive ? <Badge tone="success">Sí</Badge> : <Badge tone="muted">No</Badge>}</TD>
              <TD className="text-right">
                <Link href={`/admin/products/${p.id}`} className="text-xs text-accent hover:underline">
                  Editar
                </Link>
              </TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </div>
  );
}
