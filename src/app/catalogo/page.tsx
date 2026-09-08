import Link from "next/link";
import { auth } from "@/lib/auth";
import { getCatalog, getCatalogSidebarMeta, type CatalogContext } from "@/lib/catalog";
import { parseCatalogSearchParams } from "@/lib/catalog-url";
import { CatalogToolbar } from "@/app/portal/products/catalog-toolbar";
import { CatalogLayout } from "@/app/portal/products/catalog-sidebar";
import { CatalogGrid } from "@/app/portal/products/catalog-grid";
import { CatalogTable } from "@/app/portal/products/catalog-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ArrowRight, Lock, Package } from "lucide-react";

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

  const ctx: CatalogContext = { commercialClientId: null, userId: null, isAdmin: false, publicMode: true };
  const filters = {
    search: urlState.search,
    brandIds: urlState.brandIds,
    categoryIds: urlState.categoryIds,
    familyIds: urlState.familyIds,
    crestronOnly: urlState.crestronOnly,
    kind: urlState.kind,
    sort:
      urlState.sort === "price_asc" || urlState.sort === "price_desc" ? ("name_asc" as const) : urlState.sort,
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
        ) : (
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-card">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Lock className="h-4 w-4" />
            </span>
            <div className="text-sm">
              <p className="font-medium">Precios y stock para clientes</p>
              <p className="text-muted-foreground">
                <Link href="/login?callbackUrl=%2Fportal%2Fproducts" className="font-medium text-accent hover:underline">
                  Ingresá
                </Link>{" "}
                o{" "}
                <Link href="/#acceso" className="font-medium text-accent hover:underline">
                  pedí una cuenta
                </Link>
                .
              </p>
            </div>
          </div>
        )}
      </div>

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
