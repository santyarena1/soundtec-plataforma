"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { upsertMarginRule, upsertDiscountRule } from "@/server/actions/pricing-rules";
import { Loader2 } from "lucide-react";

interface Opt { id: string; name?: string; companyName?: string | null; normalizedName?: string }

interface Props {
  type: "margin" | "discount";
  clients: { id: string; name: string; companyName?: string | null }[];
  brands: { id: string; name: string }[];
  distributors: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  families: { id: string; name: string }[];
  products: { id: string; normalizedName: string }[];
}

const scopes = [
  { value: "GLOBAL", label: "Global" },
  { value: "BRAND", label: "Marca" },
  { value: "DISTRIBUTOR", label: "Proveedor" },
  { value: "CATEGORY", label: "Categoría" },
  { value: "FAMILY", label: "Familia" },
  { value: "PRODUCT", label: "Producto" },
  { value: "CLIENT", label: "Cliente puro" },
];

export function RulesForm({ type, clients, brands, distributors, categories, families, products }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [scope, setScope] = useState("GLOBAL");
  const [error, setError] = useState<string | null>(null);

  const scopeOptions: { id: string; name: string }[] = (() => {
    switch (scope) {
      case "BRAND": return brands;
      case "DISTRIBUTOR": return distributors;
      case "CATEGORY": return categories;
      case "FAMILY": return families;
      case "PRODUCT": return products.map((p) => ({ id: p.id, name: p.normalizedName }));
      default: return [];
    }
  })();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      try {
        const action = type === "margin" ? upsertMarginRule : upsertDiscountRule;
        await action(fd);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo guardar.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Label htmlFor="name" required>Nombre</Label>
        <Input id="name" name="name" required placeholder={type === "margin" ? "Ej: Margen marca Shure" : "Ej: Descuento cliente Acme"} />
      </div>
      <div>
        <Label htmlFor="priority">Prioridad (menor = más fuerte)</Label>
        <Input id="priority" name="priority" type="number" min={0} defaultValue={100} />
      </div>
      <div>
        <Label htmlFor="scopeType" required>Alcance</Label>
        <Select id="scopeType" name="scopeType" value={scope} onChange={(e) => setScope(e.target.value)}>
          {scopes.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="scopeId">Recurso del alcance</Label>
        <Select id="scopeId" name="scopeId" disabled={scope === "GLOBAL" || scope === "CLIENT"}>
          <option value="">—</option>
          {scopeOptions.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </Select>
      </div>
      <div>
        <Label htmlFor="clientId">Cliente (opcional)</Label>
        <Select id="clientId" name="clientId">
          <option value="">Aplica a todos</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.companyName || c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <Label htmlFor="percent" required>{type === "margin" ? "Margen %" : "Descuento %"}</Label>
        <Input id="percent" name="percent" type="number" step="0.01" required placeholder="35" />
      </div>
      <label className="flex items-end gap-2 text-sm">
        <input type="checkbox" name="isActive" defaultChecked />
        Activa
      </label>
      <div className="sm:col-span-2 lg:col-span-3 flex items-center justify-between">
        {error ? <p className="text-sm text-destructive">{error}</p> : <span />}
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Crear regla
        </Button>
      </div>
    </form>
  );
}
