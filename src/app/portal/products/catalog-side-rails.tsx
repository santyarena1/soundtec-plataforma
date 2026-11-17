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
 * Sidebar de rubros en PC (≥ 1280 px). Hasta 1799 px va al lado del listado
 * (la grilla pasa a 3 columnas); desde 1800 px entra en el margen libre, afuera
 * del contenido. Panel fijo con su propio scroll si el árbol es largo.
 */
export function CatalogCategoryRail({ nodes, activeId, params, basePath }: TreeProps) {
  if (nodes.length === 0) return null;
  return (
    <aside
      aria-label="Rubros del catálogo"
      className="hidden w-[264px] shrink-0 xl:block min-[1800px]:absolute min-[1800px]:right-full min-[1800px]:top-0 min-[1800px]:mr-6 min-[1800px]:h-full"
    >
      <div className="sticky top-20">
        <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQueryOf(params)} />
      </div>
    </aside>
  );
}

/**
 * Arriba del listado: el camino del rubro elegido y, donde no hay sidebar
 * (< 1280 px), el botón «Rubros» con el mismo árbol.
 */
export function CatalogCategoryBar({ nodes, activeId, params, basePath }: TreeProps) {
  if (nodes.length === 0) return null;
  const baseQuery = baseQueryOf(params);
  const crumbs = categoryAncestry(activeId, nodes).map((n) => ({ id: n.id, name: n.name, href: categoryHref(basePath, baseQuery, n.id) }));
  const path = crumbs.length ? (
    <CategoryPath crumbs={crumbs} rootHref={categoryHref(basePath, baseQuery, null)} clearable />
  ) : null;
  return (
    <>
      <div className="xl:hidden">
        <CategoryDropdown label="Rubros" beside={path}>
          <CategoryTreeNav nodes={nodes} activeId={activeId} basePath={basePath} baseQuery={baseQuery} variant="panel" />
        </CategoryDropdown>
      </div>
      {path ? <div className="hidden xl:block">{path}</div> : null}
    </>
  );
}
