import Link from "next/link";
import { requireUser } from "@/lib/auth-helpers";
import { resolveCommercialClientId } from "@/lib/client-context";
import { getCatalog, getCatalogSidebarMeta } from "@/lib/catalog";
import { parseCatalogSearchParams } from "@/lib/catalog-url";
import { getActiveDraftSummary } from "@/lib/draft-request";
import { CatalogToolbar } from "./catalog-toolbar";
import { CatalogLayout } from "./catalog-sidebar";
import { CatalogGrid } from "./catalog-grid";
import { CatalogTable } from "./catalog-table";
import { CatalogMultiSelectProvider } from "./catalog-multi-select";
import { EmptyState } from "@/components/ui/empty-state";
import { Package, Send } from "lucide-react";

export const metadata = { title: "Catálogo" };

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const urlState = parseCatalogSearchParams(rawParams);
  const user = await requireUser();
  const isAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const commercialClientId = isAdmin ? null : await resolveCommercialClientId(user.id);

  const ctx = { commercialClientId, userId: user.id, isAdmin };
  const filters = {
    search: urlState.search,
    brandIds: urlState.brandIds,
    distributorIds: isAdmin ? urlState.distributorIds : undefined,
    categoryIds: urlState.categoryIds,
    familyIds: urlState.familyIds,
    stock: urlState.stock,
    hasDiscount: urlState.hasDiscount,
    favoritesOnly: urlState.favoritesOnly,
    kind: urlState.kind,
    minPrice: urlState.minPrice,
    maxPrice: urlState.maxPrice,
    sort: urlState.sort,
    page: urlState.page,
  };

  const [{ items, total, page, pageSize }, meta, draft] = await Promise.all([
    getCatalog(filters, ctx),
    getCatalogSidebarMeta(filters, ctx, { includeDistributors: false }),
    getActiveDraftSummary(user.id),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const paginationParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (key === "page" || value == null) continue;
    if (Array.isArray(value)) for (const v of value) paginationParams.append(key, v);
    else paginationParams.set(key, value);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-2">Catálogo</h1>
          <p className="muted-text mt-1">Explorá productos con precios en USD para tu cuenta comercial.</p>
        </div>
        {draft ? (
          <Link
            href={`/portal/requests/${draft.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15"
          >
            <Send className="h-4 w-4" />
            Mi solicitud ({draft.itemCount})
          </Link>
        ) : null}
      </div>

      <CatalogMultiSelectProvider productIds={items.map((i) => i.id)}>
      <CatalogLayout state={urlState} meta={meta} total={total} toolbar={<CatalogToolbar state={urlState} />}>
        {items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Sin resultados"
            description="Probá otros filtros o ampliá el rango de precios."
          />
        ) : urlState.view === "table" ? (
          <CatalogTable items={items} />
        ) : (
          <CatalogGrid items={items} />
        )}

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-6 text-sm">
            {page > 1 ? (
              <Link
                href={`?${(() => {
                  const p = new URLSearchParams(paginationParams.toString());
                  p.set("page", String(page - 1));
                  return p.toString();
                })()}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
              >
                Anterior
              </Link>
            ) : null}
            <span className="text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link
                href={`?${(() => {
                  const p = new URLSearchParams(paginationParams.toString());
                  p.set("page", String(page + 1));
                  return p.toString();
                })()}`}
                className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary"
              >
                Siguiente
              </Link>
            ) : null}
          </div>
        ) : null}
      </CatalogLayout>
      </CatalogMultiSelectProvider>
    </div>
  );
}
