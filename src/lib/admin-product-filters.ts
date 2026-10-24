import { z } from "zod";

/**
 * Filtros del listado admin de productos. El listado y las acciones masivas
 * («activar/desactivar los que coinciden») arman el `where` con la misma
 * función: así nunca tocan productos distintos de los que se ven.
 */
export const adminProductFiltersSchema = z.object({
  q: z.string().max(200).optional(),
  brandIds: z.array(z.string()).default([]),
  categoryIds: z.array(z.string()).default([]),
  familyIds: z.array(z.string()).default([]),
  distributorIds: z.array(z.string()).default([]),
  stockStatuses: z.array(z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"])).default([]),
  active: z.enum(["yes", "no"]).optional(),
  nocat: z.boolean().default(false),
  noimg: z.boolean().default(false),
  nodesc: z.boolean().default(false),
  crestron: z.boolean().default(false),
  feedback: z.boolean().default(false),
  crestronMissing: z.boolean().default(false),
});

export type AdminProductFilters = z.infer<typeof adminProductFiltersSchema>;

type RawParams = Record<string, string | string[] | undefined>;

function multi(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

const STOCK = new Set(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"]);

export function parseAdminProductFilters(params: RawParams): AdminProductFilters {
  const one = (key: string) => {
    const v = params[key];
    return Array.isArray(v) ? v[0] : v;
  };
  const active = one("active");
  return {
    q: one("q")?.trim() || undefined,
    brandIds: multi(params.brand),
    categoryIds: multi(params.category),
    familyIds: multi(params.family),
    distributorIds: multi(params.distributor),
    stockStatuses: multi(params.stock).filter((s) => STOCK.has(s)) as AdminProductFilters["stockStatuses"],
    active: active === "yes" || active === "no" ? active : undefined,
    nocat: one("nocat") === "1",
    noimg: one("noimg") === "1",
    nodesc: one("nodesc") === "1",
    crestron: one("crestron") === "1",
    feedback: one("feedback") === "errors",
    crestronMissing: one("crestronMissing") === "1",
  };
}

/** ¿Hay algún filtro puesto? (sin filtros, «los que coinciden» es todo el catálogo). */
export function hasAdminProductFilters(f: AdminProductFilters): boolean {
  return Boolean(
    f.q ||
      f.brandIds.length ||
      f.categoryIds.length ||
      f.familyIds.length ||
      f.distributorIds.length ||
      f.stockStatuses.length ||
      f.active ||
      f.nocat ||
      f.noimg ||
      f.nodesc ||
      f.crestron ||
      f.feedback ||
      f.crestronMissing
  );
}
