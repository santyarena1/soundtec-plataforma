"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { upsertVisibility } from "@/server/actions/pricing-rules";
import { Button } from "@/components/ui/button";
import { Select, Label, Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search } from "lucide-react";

type Option = { id: string; name: string };

type ScopeKey = "BRAND" | "DISTRIBUTOR" | "CATEGORY" | "FAMILY" | "PRODUCT";

interface Props {
  clients: { id: string; name: string; companyName: string | null }[];
  brands: Option[];
  distributors: Option[];
  categories: Option[];
  families: Option[];
  products: Option[];
  /** Preselecciona cliente (ej. ficha de usuario). */
  defaultClientId?: string;
}

export function VisibilityRuleForm({
  clients,
  brands,
  distributors,
  categories,
  families,
  products,
  defaultClientId,
}: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [clientId, setClientId] = useState(defaultClientId || clients[0]?.id || "");
  const [scopeType, setScopeType] = useState<ScopeKey>("BRAND");
  const [canView, setCanView] = useState<"false" | "true">("false");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const optionsByScope: Record<ScopeKey, Option[]> = {
    BRAND: brands,
    DISTRIBUTOR: distributors,
    CATEGORY: categories,
    FAMILY: families,
    PRODUCT: products,
  };
  const opts = optionsByScope[scopeType];

  const filtered = useMemo(() => {
    if (!search.trim()) return opts;
    const q = search.toLowerCase();
    return opts.filter((o) => o.name.toLowerCase().includes(q));
  }, [opts, search]);

  function toggle(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllFiltered() {
    setSelectedIds((prev) => {
      const allSelected = filtered.every((o) => prev.has(o.id));
      const next = new Set(prev);
      if (allSelected) {
        for (const o of filtered) next.delete(o.id);
      } else {
        for (const o of filtered) next.add(o.id);
      }
      return next;
    });
  }

  function submit() {
    if (!clientId) {
      setError("Seleccioná un cliente.");
      return;
    }
    if (selectedIds.size === 0) {
      setError("Seleccioná al menos un recurso para aplicar la regla.");
      return;
    }
    setError(null);
    setFeedback(null);
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("clientId", clientId);
        fd.set("scopeType", scopeType);
        fd.set("canView", canView);
        for (const id of selectedIds) fd.append("scopeIds", id);
        await upsertVisibility(fd);
        setFeedback(`Aplicaste la regla a ${selectedIds.size} recurso(s).`);
        setSelectedIds(new Set());
        router.refresh();
      } catch {
        setError("Ocurrió un error guardando las reglas.");
      }
    });
  }

  return (
    <div className="grid gap-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <Label required>Cliente</Label>
          <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">Seleccionar cliente</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName || c.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label required>Alcance</Label>
          <Select
            value={scopeType}
            onChange={(e) => {
              setScopeType(e.target.value as ScopeKey);
              setSelectedIds(new Set());
              setSearch("");
            }}
          >
            <option value="BRAND">Marcas</option>
            <option value="DISTRIBUTOR">Distribuidores</option>
            <option value="CATEGORY">Categorías</option>
            <option value="FAMILY">Familias</option>
            <option value="PRODUCT">Productos</option>
          </Select>
        </div>
        <div>
          <Label>Acceso</Label>
          <Select value={canView} onChange={(e) => setCanView(e.target.value as "false" | "true")}>
            <option value="false">Ocultar para el cliente</option>
            <option value="true">Permitir explícitamente</option>
          </Select>
        </div>
      </div>

      <div className="rounded-md border border-border bg-secondary/30 p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder={`Buscar ${scopeType.toLowerCase()}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-7 text-sm"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span>
              Seleccionados: <strong className="text-foreground">{selectedIds.size}</strong>
            </span>
            <Button type="button" variant="ghost" size="sm" onClick={toggleAllFiltered} className="h-7 text-xs">
              {filtered.every((o) => selectedIds.has(o.id)) && filtered.length > 0
                ? "Quitar todos"
                : "Seleccionar todos"}
            </Button>
          </div>
        </div>

        <div className="max-h-72 overflow-y-auto rounded border border-border bg-card">
          {filtered.length === 0 ? (
            <p className="p-3 text-xs text-muted-foreground">Sin resultados.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((o) => (
                <li key={o.id}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-secondary/50">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(o.id)}
                      onChange={() => toggle(o.id)}
                    />
                    <span>{o.name}</span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {feedback ? <p className="text-sm text-success">{feedback}</p> : null}

      <div className="flex items-center justify-between">
        <Badge tone={canView === "true" ? "success" : "destructive"}>
          {canView === "true" ? "Permitir explícitamente" : "Ocultar para el cliente"}
        </Badge>
        <Button onClick={submit} disabled={pending || selectedIds.size === 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Aplicar a {selectedIds.size || 0} recurso(s)
        </Button>
      </div>
    </div>
  );
}
