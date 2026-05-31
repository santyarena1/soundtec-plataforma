"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertProduct } from "@/server/actions/admin-catalog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
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
}

export function ProductForm({ product, brands, distributors, categories, families }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

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
      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Precios e importación</p>
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
              defaultValue={product?.baseCostUsd ?? 0}
            />
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
          </div>
          <div>
            <Label htmlFor="tariffPosition">Posición arancelaria (NCM)</Label>
            <Input
              id="tariffPosition"
              name="tariffPosition"
              placeholder="Ej. 8518.21.00"
              defaultValue={product?.tariffPosition ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="tariffDutyPercent">Arancel (%)</Label>
            <Input
              id="tariffDutyPercent"
              name="tariffDutyPercent"
              type="number"
              min={0}
              step="0.01"
              placeholder="Ej. 18"
              defaultValue={product?.tariffDutyPercent ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="coefNac">Coef. NAC (vacío = global)</Label>
            <Input
              id="coefNac"
              name="coefNac"
              type="number"
              min={0}
              step="0.0001"
              placeholder="Ej. 3.5"
              defaultValue={product?.coefNac ?? ""}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Costo × TC × Coef</p>
          </div>
          <div>
            <Label htmlFor="ivaPercent">IVA (%)</Label>
            <Input
              id="ivaPercent"
              name="ivaPercent"
              type="number"
              min={0}
              step="0.01"
              placeholder="21"
              defaultValue={product?.ivaPercent ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="impIntPercent">Imp. Interno (%)</Label>
            <Input
              id="impIntPercent"
              name="impIntPercent"
              type="number"
              min={0}
              step="0.01"
              placeholder="0"
              defaultValue={product?.impIntPercent ?? ""}
            />
          </div>
          <div>
            <Label htmlFor="coefVtaFob">Coef. venta FOB</Label>
            <Input
              id="coefVtaFob"
              name="coefVtaFob"
              type="number"
              min={0}
              step="0.0001"
              placeholder="Ej. 1.15"
              defaultValue={product?.coefVtaFob ?? ""}
            />
            <p className="mt-1 text-[11px] text-muted-foreground">Costo base × Coef</p>
          </div>
        </div>
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
