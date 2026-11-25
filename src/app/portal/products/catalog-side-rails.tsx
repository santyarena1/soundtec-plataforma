import { categoryAncestry, type CategoryCountNode } from "@/lib/catalog-category-tree";
import { CategoryTreeNav } from "@/components/catalog/category-tree-nav";
import { CategoryPath } from "@/components/catalog/category-path";
import { CategoryDropdown } from "./catalog-category-client";

type RawParams = Record<string, string | string[] | undefined>;

type TreeProps = {
  nodes: CategoryCountNode[];
  activeId: string | null;
  params: RawParams;
  basePath: string;
  /** Filtro «Series» del fabricante (solo con una marca o un grupo con 2 o más series): va debajo de Rubros. */
  series?: { sidebar: React.ReactNode; panel: React.ReactNode } | null;
};

/** Filtros actuales sin rubro ni página: base de los links del árbol. */
function baseQueryOf(params: RawParams): string {
  const next = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (k === "category" || k === "page" || k === "all" || v == null) continue;
    if (Array.isArray(v)) for (const item of v) next.append(k, item);
    else next.set(k, v);
  }
  return next.toString();
}

function categoryHref(basePath: string, baseQuery: string, categoryId: string | null): string {
  const params = new URLSearchParams(baseQuery);
  if (categoryId) params.set("category", categoryId);
  const query = params.toString();
  return query ? `${basePath}?${query}` : `${basePath}?all=1`;
}

/**
 * Columna de rubros en PC (≥ 1280 px): arranca a la altura del título del
 * catálogo y acompaña el scroll (panel fijo con su propio scroll si el árbol
 * es largo). Está siempre, aunque una búsqueda no deje rubros, para que la
 * página no cambie de forma. Debajo, las series de la marca (si aplica).
 * Tablet y celular usan el botón «Rubros».
 */
export function CatalogCategoryRail({ nodes, activeId, params, basePath, series, below }: TreeProps & { below?: React.ReactNode }) {
  return (
    <aside aria-label="Rubros del catálogo" className="hidden xl:block">
      <div className="sticky top-20 flex max-h-[calc(100dvh-6rem)] flex-col gap-4">
        <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQueryOf(params)} shrinkable={!!series} />
        {series?.sidebar}
        {/* Debajo de los rubros: «Activá tus descuentos» (solo clientes con condiciones propias). */}
        {below ? <div className="shrink-0">{below}</div> : null}
      </div>
    </aside>
  );
}

/**
 * Arriba del listado, al lado de la cantidad: el camino del rubro elegido y,
 * donde no hay sidebar (< 1280 px), el botón «Rubros» con el mismo árbol (y
 * las series de la marca debajo, en el mismo desplegable).
 */
export function CatalogCategoryBar({ nodes, activeId, params, basePath, series }: TreeProps) {
  const baseQuery = baseQueryOf(params);
  const rootHref = categoryHref(basePath, baseQuery, null);
  const crumbs = categoryAncestry(activeId, nodes).map((n) => ({ id: n.id, name: n.name, href: categoryHref(basePath, baseQuery, n.id) }));
  return (
    <>
      {nodes.length > 0 || series ? (
        <div className="xl:hidden">
          <CategoryDropdown label={series ? "Rubros y series" : "Rubros"} beside={crumbs.length ? <CategoryPath crumbs={crumbs} rootHref={rootHref} clearable hideRoot /> : null}>
            <div className="space-y-3">
              {nodes.length > 0 ? <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQuery} variant="panel" /> : null}
              {series?.panel}
            </div>
          </CategoryDropdown>
        </div>
      ) : null}
      {/* PC: el camino del rubro elegido o, sin rubro, el mismo «Todos los rubros» que marca el sidebar. */}
      <div className="hidden xl:block">
        {crumbs.length ? <CategoryPath crumbs={crumbs} rootHref={rootHref} clearable /> : <p className="text-sm text-muted-foreground">Todos los rubros</p>}
      </div>
    </>
  );
}
