"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Copy, Link2, Search } from "lucide-react";
import {
  upsertShareablePriceList,
  previewShareListCount,
  regenerateShareSlug,
} from "@/server/actions/shareable-price-lists";
import { shareListPublicUrl, type ShareablePriceListFilters } from "@/lib/shareable-price-list";

type Option = { id: string; name: string };

interface Props {
  list?: {
    id: string;
    name: string;
    description: string | null;
    shareSlug: string;
    status: "DRAFT" | "ACTIVE" | "ARCHIVED";
    clientId: string | null;
    showSku: boolean;
    showStock: boolean;
    hidePrices: boolean;
    expiresAt: string | null;
    filters: ShareablePriceListFilters;
  };
  clients: { id: string; companyName: string }[];
  brands: Option[];
  categories: Option[];
  families: Option[];
  distributors: Option[];
  products: Option[];
}

function FilterSection({
  title,
  options,
  selected,
  onToggle,
  onToggleAll,
}: {
  title: string;
  options: Option[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search.trim()) return options;
    const q = search.toLowerCase();
    return options.filter((o) => o.name.toLowerCase().includes(q));
  }, [options, search]);

  return (
    <div className="rounded-lg border border-border p-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{title}</p>
        <div className="flex gap-2">
          <Badge tone="muted">{selected.size} seleccionados</Badge>
          <Button type="button" size="sm" variant="ghost" onClick={() => onToggleAll(filtered.map((o) => o.id))}>
            {filtered.every((o) => selected.has(o.id)) ? "Quitar filtrados" : "Marcar filtrados"}
          </Button>
        </div>
      </div>
      {options.length > 8 ? (
        <div className="relative mb-2">
          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder="Buscar…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      ) : null}
      <div className="max-h-40 space-y-1 overflow-y-auto">
        {filtered.map((o) => (
          <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-secondary/50">
            <input type="checkbox" checked={selected.has(o.id)} onChange={() => onToggle(o.id)} />
            <span className="truncate">{o.name}</span>
          </label>
        ))}
        {filtered.length === 0 ? <p className="text-xs text-muted-foreground">Sin resultados.</p> : null}
      </div>
    </div>
  );
}

export function ShareListForm({
  list,
  clients,
  brands,
  categories,
  families,
  distributors,
  products,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [slug, setSlug] = useState(list?.shareSlug || "");

  const [brandIds, setBrandIds] = useState(() => new Set(list?.filters.brandIds || []));
  const [categoryIds, setCategoryIds] = useState(() => new Set(list?.filters.categoryIds || []));
  const [familyIds, setFamilyIds] = useState(() => new Set(list?.filters.familyIds || []));
  const [distributorIds, setDistributorIds] = useState(() => new Set(list?.filters.distributorIds || []));
  const [productIds, setProductIds] = useState(() => new Set(list?.filters.productIds || []));
  const [excludeProductIds, setExcludeProductIds] = useState(() => new Set(list?.filters.excludeProductIds || []));

  const publicUrl = slug ? shareListPublicUrl(slug) : "";

  function toggle(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll(setter: React.Dispatch<React.SetStateAction<Set<string>>>, ids: string[]) {
    setter((prev) => {
      const allOn = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      if (allOn) ids.forEach((id) => next.delete(id));
      else ids.forEach((id) => next.add(id));
      return next;
    });
  }

  function appendSets(fd: FormData, key: string, set: Set<string>) {
    for (const id of set) fd.append(key, id);
  }

  function buildFormData(base: FormData) {
    appendSets(base, "brandIds", brandIds);
    appendSets(base, "categoryIds", categoryIds);
    appendSets(base, "familyIds", familyIds);
    appendSets(base, "distributorIds", distributorIds);
    appendSets(base, "productIds", productIds);
    appendSets(base, "excludeProductIds", excludeProductIds);
    if (base.get("kindPrincipal") === "on") base.append("kinds", "PRINCIPAL");
    if (base.get("kindAccessory") === "on") base.append("kinds", "ACCESORIO");
    return base;
  }

  function runPreview(form: HTMLFormElement) {
    const fd = buildFormData(new FormData(form));
    start(async () => {
      const r = await previewShareListCount(fd);
      setPreviewCount(r.count);
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = buildFormData(new FormData(e.currentTarget));
    start(async () => {
      const r = await upsertShareablePriceList(fd);
      if (!r.ok) {
        setError(r.error || "No se pudo guardar.");
        return;
      }
      router.push(r.id ? `/admin/share-lists/${r.id}` : "/admin/share-lists");
      router.refresh();
    });
  }

  function copyLink() {
    if (!publicUrl) return;
    void navigator.clipboard.writeText(publicUrl);
  }

  function regenSlug() {
    if (!list?.id) return;
    const fd = new FormData();
    fd.set("id", list.id);
    start(async () => {
      const r = await regenerateShareSlug(fd);
      if (r.slug) setSlug(r.slug);
      router.refresh();
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      {list?.id ? <input type="hidden" name="id" value={list.id} /> : null}
      <input type="hidden" name="shareSlug" value={slug} />

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3">
          <div>
            <Label htmlFor="name" required>
              Nombre de la lista
            </Label>
            <Input id="name" name="name" required defaultValue={list?.name} placeholder="Ej. Cotización audiovisual Q2" />
          </div>
          <div>
            <Label htmlFor="description">Descripción (visible en el link)</Label>
            <Textarea id="description" name="description" rows={2} defaultValue={list?.description || ""} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="status">Estado</Label>
              <Select id="status" name="status" defaultValue={list?.status || "DRAFT"}>
                <option value="DRAFT">Borrador</option>
                <option value="ACTIVE">Activa (link público)</option>
                <option value="ARCHIVED">Archivada</option>
              </Select>
            </div>
            <div>
              <Label htmlFor="clientId">Precios para cliente</Label>
              <Select id="clientId" name="clientId" defaultValue={list?.clientId || ""}>
                <option value="">Precio estándar (sin cliente)</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.companyName}
                  </option>
                ))}
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Aplica márgenes, descuentos y visibilidad del cliente elegido.
              </p>
            </div>
          </div>
          <div>
            <Label htmlFor="expiresAt">Vencimiento del link (opcional)</Label>
            <Input
              id="expiresAt"
              name="expiresAt"
              type="datetime-local"
              defaultValue={list?.expiresAt ? list.expiresAt.slice(0, 16) : ""}
            />
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showSku" defaultChecked={list?.showSku ?? true} />
              Mostrar SKU
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="showStock" defaultChecked={list?.showStock ?? false} />
              Mostrar stock
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" name="hidePrices" defaultChecked={list?.hidePrices ?? false} />
              Ocultar precios en el link
            </label>
          </div>
        </div>

        <div className="space-y-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
          <p className="text-sm font-semibold">Link para compartir</p>
          {slug ? (
            <>
              <code className="block break-all rounded bg-card px-2 py-2 text-xs">{publicUrl}</code>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={copyLink}>
                  <Copy className="h-3.5 w-3.5" /> Copiar link
                </Button>
                {list?.id ? (
                  <Button type="button" size="sm" variant="ghost" onClick={regenSlug} disabled={pending}>
                    Regenerar link
                  </Button>
                ) : null}
                <Link href={publicUrl} target="_blank" className="inline-flex h-8 items-center gap-1 text-sm text-accent hover:underline">
                  <Link2 className="h-3.5 w-3.5" /> Abrir vista pública
                </Link>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Solo funciona si el estado es «Activa» y no venció. El link no requiere login.
              </p>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">Guardá la lista para generar el link único.</p>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="heading-3">Filtros del catálogo</h3>
            <p className="text-xs text-muted-foreground">
              Combiná los criterios que quieras (se aplican en conjunto). Sin selección en una sección = no filtra por
              ese criterio.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={(e) => runPreview(e.currentTarget.form as HTMLFormElement)}>
            {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Vista previa: {previewCount != null ? `${previewCount} productos` : "contar"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input type="checkbox" name="kindPrincipal" defaultChecked={!list || list.filters.kinds?.includes("PRINCIPAL") !== false} />
            Principales
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="kindAccessory" defaultChecked={!list || list.filters.kinds?.includes("ACCESORIO") !== false} />
            Accesorios
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="inStockOnly" defaultChecked={list?.filters.inStockOnly} />
            Solo con stock
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="hasDiscountOnly" defaultChecked={list?.filters.hasDiscountOnly} />
            Solo con descuento
          </label>
        </div>

        <div>
          <Label htmlFor="search">Texto en nombre o SKU</Label>
          <Input id="search" name="search" defaultValue={list?.filters.search || ""} placeholder="Opcional" />
        </div>

        <div className="grid gap-3 lg:grid-cols-2">
          <FilterSection title="Marcas" options={brands} selected={brandIds} onToggle={(id) => toggle(setBrandIds, id)} onToggleAll={(ids) => toggleAll(setBrandIds, ids)} />
          <FilterSection title="Categorías" options={categories} selected={categoryIds} onToggle={(id) => toggle(setCategoryIds, id)} onToggleAll={(ids) => toggleAll(setCategoryIds, ids)} />
          <FilterSection title="Familias" options={families} selected={familyIds} onToggle={(id) => toggle(setFamilyIds, id)} onToggleAll={(ids) => toggleAll(setFamilyIds, ids)} />
          <FilterSection title="Proveedores" options={distributors} selected={distributorIds} onToggle={(id) => toggle(setDistributorIds, id)} onToggleAll={(ids) => toggleAll(setDistributorIds, ids)} />
          <FilterSection title="Productos específicos" options={products} selected={productIds} onToggle={(id) => toggle(setProductIds, id)} onToggleAll={(ids) => toggleAll(setProductIds, ids)} />
          <FilterSection title="Excluir productos" options={products} selected={excludeProductIds} onToggle={(id) => toggle(setExcludeProductIds, id)} onToggleAll={(ids) => toggleAll(setExcludeProductIds, ids)} />
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => router.push("/admin/share-lists")}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {list ? "Guardar cambios" : "Crear lista"}
        </Button>
      </div>
    </form>
  );
}
