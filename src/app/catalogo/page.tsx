import Link from "next/link";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { getCatalog, getCatalogSidebarMeta, type CatalogContext } from "@/lib/catalog";
import { parseCatalogSearchParams, countActiveCatalogFilters } from "@/lib/catalog-url";
import { getCatalogBrands } from "@/lib/catalog-brands";
import { BrandGrid } from "@/app/catalogo/brand-grid";
import { BrandBar } from "@/app/catalogo/brand-bar";
import { StickyAccountCta } from "@/components/catalog/account-cta";
import { CatalogToolbar } from "@/app/portal/products/catalog-toolbar";
import { CatalogLayout } from "@/app/portal/products/catalog-sidebar";
import { CatalogGrid } from "@/app/portal/products/catalog-grid";
import { CatalogTable } from "@/app/portal/products/catalog-table";
import { EmptyState } from "@/components/ui/empty-state";
import { AssistantEntry } from "@/components/expo/assistant-entry";
import { VISITOR_COOKIE, QR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findLiveQr, recordVisit } from "@/server/expo/visits";
import { ArrowRight, Package } from "lucide-react";
import { RememberCatalog } from "@/components/catalog/catalog-memory";

export const dynamic = "force-dynamic";

const BASE_PATH = "/catalogo";

/**
 * Catálogo público: cualquiera puede explorar productos y fichas técnicas.
 * Sin precios, sin stock, sin favoritos ni pedidos. Para eso hay que ingresar.
 */
export default async function PublicCatalogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawParams = await searchParams;
  const urlState = parseCatalogSearchParams(rawParams);
  const session = await auth().catch(() => null);
  const isLogged = !!session?.user;

  const showAll = rawParams.all === "1";
  const brands = await getCatalogBrands();
  if (!showAll && countActiveCatalogFilters(urlState) === 0 && !urlState.search?.trim()) {
    const total = brands.reduce((acc, b) => acc + b.count, 0);
    return (
      <>
        <RememberCatalog memoryKey="public" />
        <BrandGrid brands={brands} total={total} />
      </>
    );
  }
  const activeBrandId = urlState.brandIds?.length === 1 ? urlState.brandIds[0] : null;
  if (activeBrandId) {
    const store = await cookies();
    // La vista de marca se atribuye al QR solo mientras su evento está vigente.
    const qr = await findLiveQr(store.get(QR_COOKIE)?.value).catch(() => null);
    await recordVisit({ visitorId: store.get(VISITOR_COOKIE)?.value, qrId: qr?.id, type: "BRAND_VIEW", brandId: activeBrandId });
  }

  const ctx: CatalogContext = { commercialClientId: null, userId: null, isAdmin: false, publicMode: true };
  const filters = {
    search: urlState.search,
    brandIds: urlState.brandIds,
    categoryIds: urlState.categoryIds,
    familyIds: urlState.familyIds,
    crestronOnly: urlState.crestronOnly,
    kind: urlState.kind,
    sort: urlState.sort,
    page: urlState.page,
    pageSize: urlState.pageSize,
    includeOutOfStock: true,
  };

  const [{ items, total, page, pageSize }, meta] = await Promise.all([
    getCatalog(filters, ctx),
    getCatalogSidebarMeta(filters, ctx, { includeDistributors: false }),
  ]);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const pageHref = (target: number) => {
    const p = new URLSearchParams();
    for (const [key, value] of Object.entries(rawParams)) {
      if (key === "page" || value == null) continue;
      if (Array.isArray(value)) for (const v of value) p.append(key, v);
      else p.set(key, value);
    }
    p.set("page", String(target));
    return `${BASE_PATH}?${p.toString()}`;
  };

  return (
    <div className="space-y-6">
      <RememberCatalog memoryKey="public" />
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Catálogo Soundtec</p>
          <h1 className="heading-1 mt-2">Explorá los productos que representamos.</h1>
          <p className="muted-text mt-2 max-w-2xl">
            Fichas técnicas completas, especificaciones, documentos y accesorios de audio, video, control y
            videoconferencia. Precio y disponibilidad se ven con una cuenta de cliente.
          </p>
        </div>
        {isLogged ? (
          <Link
            href="/portal/products"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Ir a mi catálogo con precios <ArrowRight className="h-4 w-4" />
          </Link>
        ) : null}
      </div>

      <AssistantEntry className="lg:max-w-2xl" />

      {!isLogged ? <StickyAccountCta /> : null}

      <BrandBar brands={brands} activeBrandId={activeBrandId} />

      <CatalogLayout
        state={urlState}
        meta={meta}
        total={total}
        publicMode
        toolbar={<CatalogToolbar state={urlState} publicMode />}
      >
        {items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title="Sin resultados"
            description="Probá con otra búsqueda o quitá filtros."
          />
        ) : urlState.view === "table" ? (
          <CatalogTable items={items} publicMode basePath={BASE_PATH} />
        ) : (
          <CatalogGrid items={items} publicMode basePath={BASE_PATH} />
        )}

        {totalPages > 1 ? (
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-border pt-6 text-sm">
            {page > 1 ? (
              <Link href={pageHref(page - 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                Anterior
              </Link>
            ) : null}
            <span className="text-muted-foreground">
              Página {page} de {totalPages}
            </span>
            {page < totalPages ? (
              <Link href={pageHref(page + 1)} className="rounded-md border border-border px-3 py-1.5 hover:bg-secondary">
                Siguiente
              </Link>
            ) : null}
          </div>
        ) : null}
      </CatalogLayout>
    </div>
  );
}
