"use client";

import { useRef, useState } from "react";
import { ArrowDown, ArrowUp, ImageIcon, ImageOff, Loader2, Trash2, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { ProductSearchPicker } from "@/components/products/product-search-picker";
import { BLOCK_LABELS, type MailBlock, type ProductItem } from "@/lib/mailing/blocks";
import { searchCampaignProducts, uploadMailingImage } from "@/server/actions/mailing";

type Props = {
  block: MailBlock;
  index: number;
  count: number;
  onChange: (block: MailBlock) => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
};

const iconButton = "inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-30";

/** Tarjeta de un bloque del mail: su formulario y los botones para moverlo o sacarlo. */
export function BlockCard({ block, index, count, onChange, onMove, onRemove }: Props) {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-border/70 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{BLOCK_LABELS[block.type]}</p>
        <div className="flex items-center">
          <button type="button" className={iconButton} disabled={index === 0} onClick={() => onMove(-1)} aria-label="Subir bloque" title="Subir">
            <ArrowUp className="h-4 w-4" />
          </button>
          <button type="button" className={iconButton} disabled={index === count - 1} onClick={() => onMove(1)} aria-label="Bajar bloque" title="Bajar">
            <ArrowDown className="h-4 w-4" />
          </button>
          <button type="button" className={iconButton} onClick={onRemove} aria-label="Quitar bloque" title="Quitar">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <BlockFields block={block} onChange={onChange} />
      </div>
    </div>
  );
}

function BlockFields({ block, onChange }: { block: MailBlock; onChange: (block: MailBlock) => void }) {
  switch (block.type) {
    case "heading":
      return (
        <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
          <Input value={block.text} maxLength={300} onChange={(e) => onChange({ ...block, text: e.target.value })} placeholder="Ej.: Llegaron los nuevos Sonance Landscape" aria-label="Título" />
          <Select value={block.size} onChange={(e) => onChange({ ...block, size: e.target.value as "xl" | "lg" })} aria-label="Tamaño">
            <option value="xl">Grande</option>
            <option value="lg">Subtítulo</option>
          </Select>
        </div>
      );
    case "text":
      return (
        <div className="space-y-1.5">
          <Textarea rows={6} value={block.text} maxLength={6000} onChange={(e) => onChange({ ...block, text: e.target.value })} aria-label="Texto" />
          <p className="text-xs text-muted-foreground">
            Línea en blanco = párrafo nuevo. **negrita**, [texto del enlace](https://…). Variables: {"{{nombre}}"}, {"{{empresa}}"}, {"{{nombre|colega}}"} (con valor si falta).
          </p>
        </div>
      );
    case "image":
      return <ImageFields block={block} onChange={onChange} />;
    case "button":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Texto del botón</Label>
            <Input value={block.label} maxLength={80} onChange={(e) => onChange({ ...block, label: e.target.value })} placeholder="Ver la promo" />
          </div>
          <div className="space-y-1.5">
            <Label>Enlace</Label>
            <Input value={block.href} maxLength={2000} onChange={(e) => onChange({ ...block, href: e.target.value })} placeholder="https://www.soundtecportal.com.ar/catalogo" />
          </div>
        </div>
      );
    case "products":
      return <ProductsFields block={block} onChange={onChange} />;
    case "divider":
      return <p className="text-xs text-muted-foreground">Una línea fina para separar secciones.</p>;
  }
}

function ImageFields({ block, onChange }: { block: Extract<MailBlock, { type: "image" }>; onChange: (block: MailBlock) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  async function upload(file: File) {
    setUploading(true);
    const data = new FormData();
    data.set("file", file);
    const result = await uploadMailingImage(data);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!result.ok) return void toast.error(result.error);
    onChange({ ...block, url: result.url });
  }
  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        <div className="flex h-20 w-28 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary/40">
          {block.url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={block.url} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="min-w-0 flex-1 space-y-2">
          <Input value={block.url} onChange={(e) => onChange({ ...block, url: e.target.value })} placeholder="Pegá la dirección de la imagen o subila" aria-label="Dirección de la imagen" />
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline disabled:opacity-50">
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Subir imagen (ancho ideal 1200 px)
          </button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input value={block.alt} maxLength={200} onChange={(e) => onChange({ ...block, alt: e.target.value })} placeholder="Texto alternativo (si no carga la imagen)" aria-label="Texto alternativo" />
        <Input value={block.href} maxLength={2000} onChange={(e) => onChange({ ...block, href: e.target.value })} placeholder="Enlace al tocarla (opcional)" aria-label="Enlace de la imagen" />
      </div>
    </div>
  );
}

function ProductsFields({ block, onChange }: { block: Extract<MailBlock, { type: "products" }>; onChange: (block: MailBlock) => void }) {
  const picked = new Set(block.items.map((i) => i.productId));
  const update = (index: number, patch: Partial<ProductItem>) => onChange({ ...block, items: block.items.map((item, i) => (i === index ? { ...item, ...patch } : item)) });
  const move = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= block.items.length) return;
    const items = [...block.items];
    [items[index], items[target]] = [items[target]!, items[index]!];
    onChange({ ...block, items });
  };
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <Input value={block.title} maxLength={200} onChange={(e) => onChange({ ...block, title: e.target.value })} placeholder="Título de la sección (opcional): Ingresos de la semana" aria-label="Título de la sección" />
        <Input value={block.cta} maxLength={40} onChange={(e) => onChange({ ...block, cta: e.target.value })} placeholder="Ver ficha" aria-label="Texto del enlace de cada producto" />
      </div>
      {block.items.length < 12 ? (
        <ProductSearchPicker
          search={searchCampaignProducts}
          pickedIds={picked}
          placeholder="Buscá por modelo, marca o código para sumar productos"
          onPick={(item) => {
            const found = item as typeof item & { url?: string };
            onChange({
              ...block,
              items: [
                ...block.items,
                { productId: item.id, title: item.title, subtitle: item.subtitle ?? "", brand: item.brand ?? "", imageUrl: item.imageUrl ?? "", url: found.url ?? "", priceText: "", badge: "" },
              ],
            });
          }}
        />
      ) : (
        <p className="text-xs text-muted-foreground">Hasta 12 productos por bloque: para más, sumá otro bloque.</p>
      )}
      {block.items.length ? (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {block.items.map((item, index) => (
            <li key={`${item.productId}-${index}`} className="flex gap-3 p-3">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-white">
                {item.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.imageUrl} alt="" className="max-h-full max-w-full object-contain" />
                ) : (
                  <ImageOff className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <p className="truncate text-sm font-semibold">
                  {item.brand ? <span className="mr-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{item.brand}</span> : null}
                  {item.title}
                </p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input className="h-8 text-xs" value={item.priceText} maxLength={80} onChange={(e) => update(index, { priceText: e.target.value })} placeholder="Precio a mostrar (opcional): USD 1.290 + IVA" aria-label="Precio a mostrar" />
                  <Input className="h-8 text-xs" value={item.badge} maxLength={40} onChange={(e) => update(index, { badge: e.target.value })} placeholder="Etiqueta (opcional): Oferta, Liquidación…" aria-label="Etiqueta" />
                </div>
              </div>
              <div className="flex flex-col">
                <button type="button" className={iconButton} disabled={index === 0} onClick={() => move(index, -1)} aria-label="Subir producto">
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={iconButton} disabled={index === block.items.length - 1} onClick={() => move(index, 1)} aria-label="Bajar producto">
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button type="button" className={iconButton} onClick={() => onChange({ ...block, items: block.items.filter((_, i) => i !== index) })} aria-label="Quitar producto">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-xs text-muted-foreground">El precio no sale solo: escribilo solo si es una promo pensada para ese público (la lista la ven clientes y no clientes).</p>
    </div>
  );
}
