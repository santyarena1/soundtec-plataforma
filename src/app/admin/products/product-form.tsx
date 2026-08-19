"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { upsertProduct } from "@/server/actions/admin-catalog";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { NcmAutocomplete } from "@/components/admin/ncm-autocomplete";
import { Loader2 } from "lucide-react";
import { DescriptionsSection } from "./descriptions-section";

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
    familia: string | null;
    tipo: string | null;
    shortDescription: string | null;
    longDescription: string | null;
    baseCostUsd: number;
    discountPercent: number | null;
    tariffPosition: string | null;
    tariffDutyPercent: number | null;
    aecPercent: number | null;
    tePercent: number | null;
    coo: string | null;
    weight: number | null;
    volume: number | null;
    coefNac: number | null;
    coefVta: number | null;
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

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </p>
  );
}

export function ProductForm({ product, brands, distributors, categories, families }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // NCM
  const [tariffPosition, setTariffPosition] = useState(product?.tariffPosition ?? "");
  const [tariffDutyPercent, setTariffDutyPercent] = useState<number | null>(product?.tariffDutyPercent ?? null);
  const [aecPercent, setAecPercent] = useState<number | null>(product?.aecPercent ?? null);
  const [tePercent, setTePercent] = useState<number | null>(product?.tePercent ?? null);

  // Pricing
  const [baseCostUsd, setBaseCostUsd] = useState(product?.baseCostUsd ?? 0);
  const [discountPercent, setDiscountPercent] = useState<number | null>(product?.discountPercent ?? null);
  const [coefNac, setCoefNac] = useState<number | null>(product?.coefNac ?? null);
  const [coefVta, setCoefVta] = useState<number | null>(product?.coefVta ?? null);
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

  // Derived pricing values — only calculate when the user has entered coefficients
  const costoNacUsd = coefNac != null ? baseCostUsd * coefNac : null;
  const discountCoef = 1 - (discountPercent ?? 0) / 100;
  const precioNac = costoNacUsd != null && coefVta != null ? costoNacUsd * coefVta * discountCoef : null;
  const precioNacFinal = precioNac != null ? precioNac * (1 + (ivaPercent ?? 21) / 100) * (1 + (impIntPercent ?? 0) / 100) : null;
  const precioVtaFob = coefVtaFob != null ? baseCostUsd * coefVtaFob : null;

  function fmtUsd(n: number) {
    return n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {product?.id ? <input type="hidden" name="id" value={product.id} /> : null}

      {/* Hidden controlled inputs for FormData */}
      <input type="hidden" name="tariffDutyPercent" value={tariffDutyPercent ?? ""} />
      <input type="hidden" name="aecPercent" value={aecPercent ?? ""} />
      <input type="hidden" name="tePercent" value={tePercent ?? ""} />
      <input type="hidden" name="discountPercent" value={discountPercent ?? ""} />
      <input type="hidden" name="coefNac" value={coefNac ?? ""} />
      <input type="hidden" name="coefVta" value={coefVta ?? ""} />
      <input type="hidden" name="ivaPercent" value={ivaPercent ?? ""} />
      <input type="hidden" name="impIntPercent" value={impIntPercent ?? ""} />
      <input type="hidden" name="coefVtaFob" value={coefVtaFob ?? ""} />

      {/* ── Identificación ── */}
      <div>
        <SectionTitle>Identificación</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="internalSku" required>COD. TANGO</Label>
            <Input id="internalSku" name="internalSku" required defaultValue={product?.internalSku || ""} />
          </div>
          <div>
            <Label htmlFor="supplierSku">SKU PROVEEDOR</Label>
            <Input id="supplierSku" name="supplierSku" defaultValue={product?.supplierSku || ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="normalizedName" required>MODELO</Label>
            <Input id="normalizedName" name="normalizedName" required defaultValue={product?.normalizedName || ""} />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="originalName">MODELO PROVEEDOR</Label>
            <Input id="originalName" name="originalName" defaultValue={product?.originalName || ""} />
          </div>
        </div>
      </div>

      {/* ── Clasificación ── */}
      <div>
        <SectionTitle>Clasificación</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <Label htmlFor="brandId">MARCA</Label>
            <Select id="brandId" name="brandId" defaultValue={product?.brandId || ""}>
              <option value="">—</option>
              {brands.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="distributorId">PROVEEDOR</Label>
            <Select id="distributorId" name="distributorId" defaultValue={product?.distributorId || ""}>
              <option value="">—</option>
              {distributors.map((d) => (<option key={d.id} value={d.id}>{d.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="categoryId">RUBRO</Label>
            <Select id="categoryId" name="categoryId" defaultValue={product?.categoryId || ""}>
              <option value="">—</option>
              {categories.map((c) => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="familyId">SUBRUBRO</Label>
            <Select id="familyId" name="familyId" defaultValue={product?.familyId || ""}>
              <option value="">—</option>
              {families.map((f) => (<option key={f.id} value={f.id}>{f.name}</option>))}
            </Select>
          </div>
          <div>
            <Label htmlFor="familia">FAMILIA</Label>
            <Input id="familia" name="familia" placeholder="Ej: Amplificadores, Micrófonos…" defaultValue={product?.familia || ""} />
          </div>
          <div>
            <Label htmlFor="tipo">TIPO</Label>
            <Input id="tipo" name="tipo" placeholder="Ej: Pasivo, Activo, Inalámbrico…" defaultValue={product?.tipo || ""} />
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

      {/* ── Posición arancelaria (NCM) ── */}
      <div className="rounded-xl border border-border bg-muted/30 p-5">
        <SectionTitle>Posición arancelaria (NCM)</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="sm:col-span-2 lg:col-span-3">
            <Label htmlFor="tariffPosition">POSICIÓN ARANCELARIA (NCM)</Label>
            <NcmAutocomplete
              value={tariffPosition}
              onChange={setTariffPosition}
              onApply={(pos, die, aec, te) => {
                setTariffPosition(pos);
                if (die != null) setTariffDutyPercent(die);
                if (aec != null) setAecPercent(aec);
                if (te != null) setTePercent(te);
              }}
            />
          </div>
          <div>
            <Label htmlFor="aecDisplay">AEC (%)</Label>
            <input
              id="aecDisplay"
              type="number"
              min={0}
              step="0.01"
              placeholder="Auto desde NCM"
              value={aecPercent ?? ""}
              onChange={(e) => setAecPercent(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <Label htmlFor="dieDisplay">DIE (%)</Label>
            <input
              id="dieDisplay"
              type="number"
              min={0}
              step="0.01"
              placeholder="Auto desde NCM"
              value={tariffDutyPercent ?? ""}
              onChange={(e) => setTariffDutyPercent(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <Label htmlFor="teDisplay">TE (%)</Label>
            <input
              id="teDisplay"
              type="number"
              min={0}
              step="0.01"
              placeholder="Auto desde NCM"
              value={tePercent ?? ""}
              onChange={(e) => setTePercent(e.target.value ? Number(e.target.value) : null)}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          <div>
            <Label htmlFor="coo">COO (País de origen)</Label>
            <Input id="coo" name="coo" placeholder="Ej: China, USA, Brasil…" defaultValue={product?.coo || ""} />
          </div>
          <div>
            <Label htmlFor="weight">Peso (kg)</Label>
            <Input id="weight" name="weight" type="number" min={0} step="0.001" placeholder="0.000" defaultValue={product?.weight ?? ""} />
          </div>
          <div>
            <Label htmlFor="volume">Volumen (m³)</Label>
            <Input id="volume" name="volume" type="number" min={0} step="0.0001" placeholder="0.0000" defaultValue={product?.volume ?? ""} />
          </div>
        </div>
      </div>

      {/* ── Cadena de precios ── */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50/60 p-5 dark:border-blue-900/50 dark:bg-blue-950/20">
        <div className="mb-4 flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-xs font-bold text-white">$</span>
          <div>
            <p className="text-sm font-semibold text-blue-900 dark:text-blue-200">Cadena de precios</p>
            <p className="text-xs text-blue-700/70 dark:text-blue-400/70">COSTO NAC USD = COSTO BASE × COEF NAC · PRECIO NAC = COSTO NAC × COEF VTA × DESC ESP</p>
          </div>
        </div>

        {/* Costo base */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Costo base (FOB)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="baseCostUsd" required>COSTO BASE USD</Label>
              <Input
                id="baseCostUsd"
                name="baseCostUsd"
                type="number"
                min={0}
                step="0.0001"
                required
                value={baseCostUsd}
                onChange={(e) => setBaseCostUsd(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <Label htmlFor="discountPercentDisplay">DESCUENTO ESPECIAL (%)</Label>
              <p className="mb-1 text-[11px] text-muted-foreground">
                Baja el precio para todos los clientes. Se lista en Admin → Descuentos, no hace falta crear una regla.
              </p>
              <input
                id="discountPercentDisplay"
                type="number"
                min={0}
                max={100}
                step="0.1"
                placeholder="0"
                value={discountPercent ?? ""}
                onChange={(e) => setDiscountPercent(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
          </div>
        </div>

        {/* Precio nacional */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Precio mercado nacional</p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <Label htmlFor="coefNacDisplay">COEF NAC</Label>
              <input
                id="coefNacDisplay"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Vacío = usa global"
                value={coefNac ?? ""}
                onChange={(e) => setCoefNac(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">COSTO NAC USD = COSTO BASE × COEF NAC</p>
            </div>
            <div>
              <Label>COSTO NAC USD</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                {costoNacUsd != null ? fmtUsd(costoNacUsd) : "—"}
              </div>
            </div>
            <div>
              <Label htmlFor="coefVtaDisplay">COEF VTA (Derecho arancelario)</Label>
              <input
                id="coefVtaDisplay"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Ej. 1.30"
                value={coefVta ?? ""}
                onChange={(e) => setCoefVta(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
              <p className="mt-1 text-[11px] text-muted-foreground">PRECIO NAC = COSTO NAC × COEF VTA × DESC ESP</p>
            </div>
            <div>
              <Label>PRECIO NAC</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                {precioNac != null ? fmtUsd(precioNac) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* IVA + Imp Int */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Impuestos</p>
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="ivaPercentDisplay">IVA</Label>
              <select
                id="ivaPercentDisplay"
                value={ivaPercent != null ? String(ivaPercent) : "21"}
                onChange={(e) => setIvaPercent(Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="0">0% — Exento</option>
                <option value="10.5">10.5% — Tasa reducida</option>
                <option value="21">21% — Tasa general</option>
                <option value="27">27% — Tasa superior</option>
              </select>
            </div>
            <div>
              <Label htmlFor="impIntPercentDisplay">IMP INT (%)</Label>
              <input
                id="impIntPercentDisplay"
                type="number"
                min={0}
                step="0.01"
                placeholder="0"
                value={impIntPercent ?? ""}
                onChange={(e) => setImpIntPercent(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <Label>PRECIO NAC FINAL</Label>
              <div className="flex h-9 items-center rounded-md border border-blue-300 bg-blue-50 px-3 font-mono text-sm font-semibold text-blue-900 dark:border-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                {precioNacFinal != null ? fmtUsd(precioNacFinal) : "—"}
              </div>
            </div>
          </div>
        </div>

        {/* FOB */}
        <div className="mb-4 rounded-lg bg-white/70 p-4 dark:bg-white/5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-blue-800/60 dark:text-blue-300/60">Precio venta FOB (USD)</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="coefVtaFobDisplay">COEF VTA FOB</Label>
              <input
                id="coefVtaFobDisplay"
                type="number"
                min={0}
                step="0.0001"
                placeholder="Ej. 1.15"
                value={coefVtaFob ?? ""}
                onChange={(e) => setCoefVtaFob(e.target.value ? Number(e.target.value) : null)}
                className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div>
              <Label>PRECIO VTA FOB</Label>
              <div className="flex h-9 items-center rounded-md border border-border bg-muted/40 px-3 font-mono text-sm text-muted-foreground">
                {precioVtaFob != null ? fmtUsd(precioVtaFob) : "—"}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── DISPONIBILIDAD ── */}
      <div>
        <SectionTitle>Disponibilidad</SectionTitle>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="stockStatus">DISPONIBILIDAD</Label>
            <Select id="stockStatus" name="stockStatus" defaultValue={product?.stockStatus || "UNKNOWN"}>
              <option value="IN_STOCK">&gt;5 unidades</option>
              <option value="LOW_STOCK">&lt;5 unidades</option>
              <option value="ON_REQUEST">CONSULTAR</option>
              <option value="OUT_OF_STOCK">Sin stock</option>
              <option value="UNKNOWN">Desconocido</option>
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

      {/* ── Descripciones (con generación IA inline) ── */}
      <div>
        <SectionTitle>Descripciones</SectionTitle>
        <DescriptionsSection
          productId={product?.id ?? null}
          initialShort={product?.shortDescription ?? ""}
          initialLong={product?.longDescription ?? ""}
          isAi={false}
        />
      </div>

      {/* ── Opciones ── */}
      <div className="flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="isCustomizable" defaultChecked={product?.isCustomizable} />
          Producto configurable (con accesorios/opcionales)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="accessoryRequiredWithPrimary" defaultChecked={product?.accessoryRequiredWithPrimary} />
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
