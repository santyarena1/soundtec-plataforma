"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertProduct } from "@/server/actions/admin-catalog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { PricingPreviewCard } from "@/components/admin/pricing-preview-card";
import { Loader2 } from "lucide-react";

interface Option { id: string; name: string }

interface Props {
  product?: {
    id: string;
    internalSku: string | null;
    supplierSku: string | null;
    normalizedName: string;
    originalName: string;
    brandId: string | null;
    distributorId: string | null;
    categoryId: string | null;
    familyId: string | null;
    shortDescription: string | null;
    longDescription: string | null;
    baseCostUsd: number;
    discountPercent: number | null;
    tariffPosition: string | null;
    tariffDutyPercent: number | null;
    coefNac: number | null;
    ivaPercent: number | null;
    impIntPercent: number | null;
    coefVtaFob: number | null;
    stockStatus: string;
    stockQuantity: number | null;
    isCustomizable: boolean;
    isCrestronHomeCompatible: boolean;
    kind: "PRINCIPAL" | "ACCESORIO";
    accessoryRequiredWithPrimary: boolean;
    isActive: boolean;
  };
  brands: Option[];
  distributors: Option[];
  categories: Option[];
  families: Option[];
  tcVenta?: number;
  globalCoefNac?: number;
}

export function ProductForm({ product, brands, distributors, categories, families, tcVenta = 0, globalCoefNac = 35 }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Live pricing state for the inline preview
  const [baseCostUsd, setBaseCostUsd] = useState(product?.baseCostUsd ?? 0);
  const [tariffDutyPercent, setTariffDutyPercent] = useState<number | null>(product?.tariffDutyPercent ?? null);
  const [coefNac, setCoefNac] = useState<number | null>(product?.coefNac ?? null);
  const [ivaPercent, setIvaPercent] = useState<number | null>(product?.ivaPercent ?? null);
  const [impIntPercent, setImpIntPercent] = useState<number | null>(product?.impIntPercent ?? null);
  const [coefVtaFob, setCoefVtaFob] = useState<number | null>(product?.coefVtaFob ?? null);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const result = await upsertProduct(fd);
      if (!result?.ok) {
        setError(result?.error || "No se pudo guardar.");
        return;
      }
      if (result.id) router.push(`/admin/products/${result.id}`);
      else router.push("/admin/products");
      router.refresh();
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}

      {/* ── Identificación ── */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="internalSku" required>COD. TANGO</Label>
          <Input id="internalSku" name="internalSku" required defaultValue={product?.internalSku || ""} />
        </div>
        <div>
          <Label htmlFor="supplierSku">SKU del proveedor</Label>
          <Input id="supplierSku" name="supplierSku" defaultValue={product?.supplierSku || ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="normalizedName" required>Nombre normalizado</Label>
          <Input id="normalizedName" name="normalizedName" required defaultValue={product?.normalizedName || ""} />
        </div>
        <div className="sm:col-span-2">
          <Label htmlFor="originalName">Nombre original del proveedor</Label>
          <Input id="originalName" name="originalName" defaultValue={product?.originalName || ""} />
        </div>
      </div>

      {/* ── Clasificación ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Clasificación</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="brandId">Marca</Label>
            <Select id="brandId" name="brandId" defaultValue={product?.brandId || ""}>
              <option value="">—</option>
              {brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="distributorId">Proveedor</Label>
            <Select id="distributorId" name="distributorId" defaultValue={product?.distributorId || ""}>
              <option value="">—</option>
              {distributors.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="categoryId">Rubro</Label>
            <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId || ""}>
              <option value="">—</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="familyId">Subrubro</Label>
            <Select id="familyId" name="familyId" defaultValue={product?.familyId || ""}>
              <option value="">—</option>
              {families.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="kind">Tipo de producto</Label>
            <Select id="kind" name="kind" defaultValue={product?.kind || "PRINCIPAL"}>
              <option value="PRINCIPAL">Principal</option>
              <option value="ACCESORIO">Accesorio</option>
            </Select>
          </div>
        </div>
      </div>

      {/* ── Precios / Importación ── */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">$</span>
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Precios e importación</p>
            <p className="text-xs text-blue-700/70 dark:text-blue-400/70">Todos los valores que determinan el costo y precio de venta del producto</p>
          </div>
        </div>

        {/* Bloque 1: costo origen */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Costo de origen (FOB)</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="baseCostUsd" required>Costo base (USD)</Label>
              <Input
                id="baseCostUsd"
                name="baseCostUsd"
                type="number"
                min={0}
                step="0.01"
                required
                value={baseCostUsd}
                onChange={(e) => setBaseCostUsd(Number(e.target.value) || 0)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Precio FOB del proveedor en dólares</p>
            </div>
            <div>
              <Label htmlFor="discountPercent">Descuento intrínseco (%)</Label>
              <Input
                id="discountPercent"
                name="discountPercent"
                type="number"
                min={0}
                max={100}
                step="0.1"
                placeholder="0"
                defaultValue={product?.discountPercent ?? ""}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Descuento ya incluido en la lista del proveedor</p>
            </div>
            <div>
              <Label htmlFor="tariffPosition">Posición arancelaria (NCM)</Label>
              <Input
                id="tariffPosition"
                name="tariffPosition"
                placeholder="Ej. 8518.21.00"
                defaultValue={product?.tariffPosition ?? ""}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Código aduanero del producto</p>
            </div>
            <div>
              <Label htmlFor="tariffDutyPercent">Derecho de importación (%)</Label>
              <Input
                id="tariffDutyPercent"
                name="tariffDutyPercent"
                type="number"
                min={0}
                step="0.01"
                placeholder="Ej. 18"
                value={tariffDutyPercent ?? ""}
                onChange={(e) => setTariffDutyPercent(e.target.value ? Number(e.target.value) : null)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Arancel que se aplica al ingresar al país</p>
            </div>
          </div>
        </div>

        {/* Bloque 2: precio mercado nacional */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Precio mercado nacional (ARS)</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="coefNac">Coeficiente NAC</Label>
              <Input
                id="coefNac"
                name="coefNac"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Vacío = usa el global"
                value={coefNac ?? ""}
                onChange={(e) => setCoefNac(e.target.value ? Number(e.target.value) : null)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Costo USD × TC × Coef → precio ARS. Si está vacío usa el coeficiente global del sistema.</p>
            </div>
            <div>
              <Label htmlFor="ivaPercent">IVA</Label>
              <Select
                id="ivaPercent"
                name="ivaPercent"
                value={ivaPercent != null ? String(ivaPercent) : "21"}
                onChange={(e) => setIvaPercent(Number(e.target.value))}
              >
                <option value="0">0% — Exento</option>
                <option value="10.5">10.5% — Tasa reducida</option>
                <option value="21">21% — Tasa general</option>
                <option value="27">27% — Tasa superior</option>
              </Select>
              <p className="mt-1 text-[11px] text-muted-foreground">Se suma al precio final. La mayoría de los productos aplica 21%.</p>
            </div>
            <div>
              <Label htmlFor="impIntPercent">Impuesto interno (%)</Label>
              <Input
                id="impIntPercent"
                name="impIntPercent"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={impIntPercent ?? ""}
                onChange={(e) => setImpIntPercent(e.target.value ? Number(e.target.value) : null)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Impuesto interno específico del rubro (ej. electrónica, bebidas, etc.).</p>
            </div>
          </div>
        </div>

        {/* Bloque 3: precio venta FOB */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Precio venta FOB (USD)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="coefVtaFob">Coeficiente de venta FOB</Label>
              <Input
                id="coefVtaFob"
                name="coefVtaFob"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Ej. 1.15"
                value={coefVtaFob ?? ""}
                onChange={(e) => setCoefVtaFob(e.target.value ? Number(e.target.value) : null)}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">Costo base USD × Coef → precio de venta en dólares para exportación o ventas FOB.</p>
            </div>
          </div>
        </div>

        {/* Vista previa inline */}
        {tcVenta > 0 || baseCostUsd > 0 ? (
          <div className="rounded-lg border border-blue-200/60 bg-white/80 p-4 dark:border-blue-800/40 dark:bg-white/5">
            <PricingPreviewCard
              baseCostUsd={baseCostUsd}
              tariffDutyPercent={tariffDutyPercent}
              coefNac={coefNac}
              ivaPercent={ivaPercent}
              impIntPercent={impIntPercent}
              coefVtaFob={coefVtaFob}
              tcVenta={tcVenta}
              globalCoefNac={globalCoefNac}
            />
          </div>
        ) : null}
      </div>

      {/* ── Stock ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Stock</p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="stockStatus">Estado</Label>
            <Select id="stockStatus" name="stockStatus" defaultValue={product?.stockStatus || "UNKNOWN"}>
              <option value="UNKNOWN">Desconocido</option>
              <option value="IN_STOCK">En stock</option>
              <option value="LOW_STOCK">Stock bajo</option>
              <option value="OUT_OF_STOCK">Sin stock</option>
              <option value="ON_REQUEST">Bajo pedido</option>
            </Select>
          </div>
          <div>
            <Label htmlFor="stockQuantity">Cantidad (opcional)</Label>
            <Input
              id="stockQuantity"
              name="stockQuantity"
              type="number"
              min={0}
              defaultValue={product?.stockQuantity ?? ""}
            />
          </div>
        </div>
      </div>

      {/* ── Descripción ── */}
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Descripción</p>
        <div className="grid gap-4">
          <div>
            <Label htmlFor="shortDescription">Descripción corta</Label>
            <Textarea id="shortDescription" name="shortDescription" rows={2} defaultValue={product?.shortDescription || ""} />
          </div>
          <div>
            <Label htmlFor="longDescription">Descripción larga</Label>
            <Textarea id="longDescription" name="longDescription" rows={6} defaultValue={product?.longDescription || ""} />
          </div>
          <div>
            <Label htmlFor="imageUrl">URL de imagen principal (se agrega como nueva)</Label>
            <Input id="imageUrl" name="imageUrl" type="url" placeholder="https://..." />
          </div>
        </div>
      </div>

      {/* ── Opciones ── */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isCustomizable" defaultChecked={product?.isCustomizable} />
          Producto configurable (con accesorios/opcionales)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            name="accessoryRequiredWithPrimary"
            defaultChecked={product?.accessoryRequiredWithPrimary}
          />
          Si es accesorio, exigir producto principal compatible
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isCrestronHomeCompatible" defaultChecked={product?.isCrestronHomeCompatible} />
          Compatible con Crestron Home
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isActive" defaultChecked={product ? product.isActive : true} />
          Producto activo
        </label>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <div className="flex justify-end gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {product ? "Guardar cambios" : "Crear producto"}
        </Button>
      </div>
    </form>
  );
}
