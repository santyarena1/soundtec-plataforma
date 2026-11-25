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
 * página no cambie de forma. Tablet y celular usan el botón «Rubros».
 */
export function CatalogCategoryRail({ nodes, activeId, params, basePath, below }: TreeProps & { below?: React.ReactNode }) {
  return (
    <aside aria-label="Rubros del catálogo" className="hidden xl:block">
      <div className="sticky top-20 space-y-4">
        <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQueryOf(params)} />
        {/* Debajo de los rubros: «Activá tus descuentos» (solo clientes con condiciones propias). */}
        {below}
      </div>
    </aside>
  );
}

/**
 * Arriba del listado, al lado de la cantidad: el camino del rubro elegido y,
 * donde no hay sidebar (< 1280 px), el botón «Rubros» con el mismo árbol.
 */
export function CatalogCategoryBar({ nodes, activeId, params, basePath }: TreeProps) {
  const baseQuery = baseQueryOf(params);
  const rootHref = categoryHref(basePath, baseQuery, null);
  const crumbs = categoryAncestry(activeId, nodes).map((n) => ({ id: n.id, name: n.name, href: categoryHref(basePath, baseQuery, n.id) }));
  return (
    <>
      {nodes.length > 0 ? (
        <div className="xl:hidden">
          <CategoryDropdown label="Rubros" beside={crumbs.length ? <CategoryPath crumbs={crumbs} rootHref={rootHref} clearable hideRoot /> : null}>
            <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQuery} variant="panel" />
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
