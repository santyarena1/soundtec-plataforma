"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  ToggleRight,
  ToggleLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
} from "lucide-react";
import { bulkSetActiveByFilter } from "@/server/actions/admin-catalog";

interface Props {
  /** Cantidad de productos que matchean los filtros actuales (informativo). */
  matchingCount: number;
  /** Filtros actuales aplicados en la URL — los reusamos como input del bulk. */
  filters: {
    brandIds: string[];
    categoryIds: string[];
    familyIds: string[];
    q?: string;
  };
  /** Marca → contador, para el dropdown de "activar todos de marca X". */
  brands: Array<{ id: string; name: string; productCount?: number }>;
}

export function BulkActiveBar({ matchingCount, filters, brands }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<string>("");
  // Colapsado por default — son acciones que pisan estado de muchos productos,
  // no queremos que estén a un click de distancia accidental.
  const [open, setOpen] = useState(false);

  function doBulk(isActive: boolean, useFilters: boolean) {
    const label = isActive ? "ACTIVAR" : "DESACTIVAR";
    const targetText = useFilters
      ? `${matchingCount} producto(s) que matchean los filtros actuales`
      : selectedBrand
      ? `TODOS los productos de la marca «${brands.find((b) => b.id === selectedBrand)?.name ?? "?"}»`
      : "TODOS los productos del catálogo";

    if (!window.confirm(`${label} ${targetText}. ¿Confirmás?`)) return;
    setMsg(null);
    start(async () => {
      const payload: Parameters<typeof bulkSetActiveByFilter>[0] = {
        isActive,
        // Solo actualizamos los que cambiarían (más rápido y deja una métrica clara)
        onlyInactive: isActive,
        onlyActive: !isActive,
      };
      if (useFilters) {
        payload.brandIds = filters.brandIds;
        payload.categoryIds = filters.categoryIds;
        payload.familyIds = filters.familyIds;
        payload.q = filters.q;
      } else if (selectedBrand) {
        payload.brandIds = [selectedBrand];
      }
      const r = await bulkSetActiveByFilter(payload);
      if (r.ok) {
        setMsg(`${r.affected} producto(s) ${isActive ? "activado(s)" : "desactivado(s)"}.`);
        router.refresh();
      } else {
        setMsg(r.error || "Error inesperado.");
      }
    });
  }

  const hasFilters =
    filters.brandIds.length > 0 ||
    filters.categoryIds.length > 0 ||
    filters.familyIds.length > 0 ||
    (filters.q ?? "").length > 0;

  return (
    <Card className={open ? "border-warning/40" : "border-dashed"}>
      <CardContent className="p-3 space-y-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-3 text-left rounded-md hover:bg-muted/30 px-2 py-1.5 transition-colors"
          aria-expanded={open}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Badge tone="warning">
              <AlertTriangle className="h-3 w-3" />
              Acción masiva
            </Badge>
            <span className="text-sm font-medium">
              Activar / desactivar productos sin seleccionarlos uno a uno
            </span>
            {!open && msg ? (
              <span className="text-[11px] text-success ml-2 flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3" />
                {msg}
              </span>
            ) : null}
          </div>
          {open ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
          )}
        </button>

        {!open ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Por filtros actuales
            </p>
            <p className="text-xs text-muted-foreground">
              {hasFilters ? (
                <>
                  Aplicar sobre los <strong className="text-foreground">{matchingCount}</strong>{" "}
                  productos que matchean los filtros activos arriba (búsqueda, marcas, categorías).
                </>
              ) : (
                <>
                  Sin filtros aplicados. La acción afecta a{" "}
                  <strong className="text-foreground">{matchingCount}</strong> producto(s) (todo el catálogo).
                </>
              )}
            </p>
            <div className="flex gap-2 flex-wrap">
              <Button
                size="sm"
                variant="outline"
                onClick={() => doBulk(true, true)}
                disabled={pending || matchingCount === 0}
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <ToggleRight className="mr-1.5 h-3.5 w-3.5" />
                )}
                Activar matcheados
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => doBulk(false, true)}
                disabled={pending || matchingCount === 0}
              >
                <ToggleLeft className="mr-1.5 h-3.5 w-3.5" />
                Desactivar matcheados
              </Button>
            </div>
          </div>

          <div className="rounded-md border border-border p-3 space-y-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Por marca específica
            </p>
            <p className="text-xs text-muted-foreground">
              Elegí una marca y aplicá a TODOS sus productos (ignora los filtros de arriba).
            </p>
            <div className="flex gap-2 flex-wrap items-center">
              <select
                value={selectedBrand}
                onChange={(e) => setSelectedBrand(e.target.value)}
                className="h-8 rounded-md border border-border bg-background px-2 text-xs flex-1 min-w-[150px]"
              >
                <option value="">— Elegir marca —</option>
                {brands.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {b.productCount != null ? ` (${b.productCount})` : ""}
                  </option>
                ))}
              </select>
              <Button
                size="sm"
                variant="outline"
                onClick={() => doBulk(true, false)}
                disabled={pending || !selectedBrand}
              >
                <ToggleRight className="mr-1.5 h-3.5 w-3.5" />
                Activar
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => doBulk(false, false)}
                disabled={pending || !selectedBrand}
              >
                <ToggleLeft className="mr-1.5 h-3.5 w-3.5" />
                Desactivar
              </Button>
            </div>
          </div>
        </div>
        )}

        {open && msg ? (
          <p className="text-xs text-success flex items-center gap-1">
            <CheckCircle2 className="h-3 w-3" />
            {msg}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
