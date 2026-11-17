import { canSeeCosts, isPanelRole, permissionsHave } from "@/lib/permissions";
import { getCurrentPermissions, requireUser } from "@/lib/auth-helpers";
import Link from "next/link";
import { resolveCommercialClientId } from "@/lib/client-context";
import { catalogFilterMeta, getCatalog, listCatalogCategoryTree, listVisibleCatalogBrands } from "@/lib/catalog";
import { countActiveCatalogFilters, parseCatalogSearchParams } from "@/lib/catalog-url";
import { CRESTRON_HOME_ID } from "@/lib/catalog-brands";
import { BrandGrid } from "@/app/catalogo/brand-grid";
import { BrandBar } from "@/app/catalogo/brand-bar";
import { getActiveDraftSummary } from "@/lib/draft-request";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";
import { CatalogToolbar } from "./catalog-toolbar";
import { CatalogLayout } from "./catalog-sidebar";
import { CatalogGrid } from "./catalog-grid";
import { CatalogTable } from "./catalog-table";
import { CatalogMultiSelectProvider } from "./catalog-multi-select";
import { EmptyState } from "@/components/ui/empty-state";
import { AssistantEntry } from "@/components/expo/assistant-entry";
import { Package, Send } from "lucide-react";
import { RememberCatalog } from "@/components/catalog/catalog-memory";
import { PriceTaxNotice } from "@/components/catalog/price-tax-notice";
import { ComingSoonBanner } from "@/components/catalog/coming-soon-banner";
import { CatalogCategoryBar, CatalogCategoryRail } from "./catalog-side-rails";

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
  // El equipo interno ve el catálogo completo con los precios de venta generales (sin condiciones de un cliente).
  const internal = isPanelRole(user.role);
  const commercialClientId = internal ? null : await resolveCommercialClientId(user.id);

  const ctx = { commercialClientId, userId: user.id, isAdmin: internal };
  // Editar precios desde el catálogo: quien gestiona márgenes y ve costos.
  const permissions = internal ? (await getCurrentPermissions()).permissions : null;
  const canEditPrices = !!permissions && permissionsHave(permissions, "margins.manage") && canSeeCosts(permissions);
  // Estrella (sale primero al entrar a la marca): quien edita productos.
  const canFeature = !!permissions && permissionsHave(permissions, "products.edit");
  const filters = {
    search: urlState.search,
    brandIds: urlState.brandIds,
    distributorIds: isAdmin ? urlState.distributorIds : undefined,
    categoryIds: urlState.categoryIds,
    familyIds: urlState.familyIds,
    stock: urlState.stock,
    includeOutOfStock: urlState.includeOutOfStock,
    hasDiscount: urlState.hasDiscount,
    favoritesOnly: urlState.favoritesOnly,
    crestronOnly: urlState.crestronOnly,
    kind: urlState.kind,
    minPrice: urlState.minPrice,
    maxPrice: urlState.maxPrice,
    sort: urlState.sort,
    page: urlState.page,
    pageSize: urlState.pageSize,
  };

  // Grilla y barra: un groupBy por marca. No se leen ni cotizan todos los productos.
  const showGrid = rawParams.all !== "1" && countActiveCatalogFilters(urlState) === 0;
  const brandsPromise = listVisibleCatalogBrands(ctx);
  if (showGrid) {
    const listed = await brandsPromise;
    return (
      <>
        <RememberCatalog memoryKey="portal" />
        <BrandGrid brands={listed.brands} total={listed.total} basePath="/portal/products" />
      </>
    );
  }
  const activeBrandId = urlState.brandIds?.length === 1 ? urlState.brandIds[0] : null;

  const [listed, { items, total, page, pageSize }, meta, draft, categoryTree] = await Promise.all([
    brandsPromise,
    getCatalog(filters, ctx),
    catalogFilterMeta(filters),
    // Pedidos apagados (src/lib/customer-orders.ts): sin «Mi pedido».
    CUSTOMER_ORDERS_ENABLED ? getActiveDraftSummary(user.id) : null,
    listCatalogCategoryTree(filters, ctx),
  ]);
  const brands = listed.brands;
  const categoryProps = {
    nodes: categoryTree,
    activeId: urlState.categoryIds?.[0] ?? null,
    params: rawParams,
    basePath: "/portal/products",
  };
  // Un solo rubro y presente en el árbol: su camino ya se ve arriba del listado.
  const categoryInPath = urlState.categoryIds?.length === 1 && categoryTree.some((n) => n.id === categoryProps.activeId);
  const comingSoonBrand = activeBrandId ? brands.find((b) => b.id === activeBrandId && b.comingSoon) ?? null : null;

  const onlyComingSoon = comingSoonBrand !== null && total === 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const paginationParams = new URLSearchParams();
  for (const [key, value] of Object.entries(rawParams)) {
    if (key === "page" || value == null) continue;
    // keep perPage so page navigation preserves the chosen page size
    if (Array.isArray(value)) for (const v of value) paginationParams.append(key, v);
    else paginationParams.set(key, value);
  }

  return (
    <div className="relative space-y-6">
      <RememberCatalog memoryKey="portal" />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="heading-2">Catálogo</h1>
          <PriceTaxNotice className="mt-2" />
        </div>
        {draft ? (
          <Link
            href={`/portal/requests/${draft.id}`}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-primary/30 bg-primary/10 px-4 text-sm font-medium text-primary hover:bg-primary/15"
          >
            <Send className="h-4 w-4" />
            Mi pedido ({draft.itemCount})
          </Link>
        ) : null}
      </div>

      {/* De lado a lado del contenedor, igual que la fila de marcas. */}
      <AssistantEntry href="/expo?from=portal" />

      <BrandBar brands={brands} activeBrandId={activeBrandId ?? (urlState.crestronOnly ? CRESTRON_HOME_ID : null)} basePath="/portal/products" />

      {/* Listado con el sidebar de rubros al lado (PC) o el botón «Rubros» arriba (tablet y celular). */}
      <div className="relative xl:flex xl:gap-6 min-[1800px]:block">
      <CatalogCategoryRail {...categoryProps} />
      <div className="min-w-0 flex-1 space-y-6">
      <CatalogCategoryBar {...categoryProps} />

      {comingSoonBrand ? <ComingSoonBanner brand={comingSoonBrand} /> : null}

      {/* Marca «Próximamente» sin productos: solo el aviso, sin «0 resultados» ni buscador vacío. */}
      {onlyComingSoon ? null : (
      <CatalogMultiSelectProvider productIds={items.map((i) => i.id)} canEditPrices={canEditPrices} canOrder={CUSTOMER_ORDERS_ENABLED}>
      <CatalogLayout state={urlState} meta={meta} total={total} categoryShownAbove={categoryInPath} toolbar={<CatalogToolbar state={urlState} />}>
        {items.length === 0 && comingSoonBrand ? null : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Sin resultados"
            description="Probá otros filtros o ampliá el rango de precios."
          />
        ) : urlState.view === "table" ? (
          <CatalogTable items={items} internal={internal} />
        ) : (
          <CatalogGrid items={items} internal={internal} canFeature={canFeature} withSidebar={categoryTree.length > 0} />
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
      )}
      </div>
      </div>
    </div>
  );
}
