import { COMMERCIAL_TAGS, isCommercialTag } from "@/lib/commercial-tags";

/**
 * Botones de filtro rápido arriba del catálogo: uno por cada etiqueta del panel
 * (Admin → Etiquetas: «Precio promocional», «Precio especial»…), uno por cada
 * cartel comercial (A pedido, Liquidación…), «Con descuento» y «Favoritos».
 * Solo se muestran los que tienen productos visibles para quien mira (o los ya
 * tocados, para poder soltarlos). Sin base de datos: recibe los conteos.
 */

export type QuickFilterKind = "label" | "tag" | "discount" | "favorites";

export interface QuickFilter {
  kind: QuickFilterKind;
  /** Id de la etiqueta, clave del cartel («LIQUIDACION»), o «discount» / «favorites». */
  id: string;
  label: string;
  count: number;
  active: boolean;
  /** Color de la etiqueta del panel (las otras usan los colores del portal). */
  color?: string;
}

export interface QuickFilterCounts {
  labels: Array<{ id: string; name: string; color: string; count: number }>;
  tags: Array<{ key: string; count: number }>;
  /** null = no aplica (catálogo público: sin precios). */
  discount: number | null;
  /** null = no aplica (sin sesión). */
  favorites: number | null;
}

export interface QuickFilterState {
  labelIds?: string[];
  commercialTags?: string[];
  hasDiscount?: boolean;
  favoritesOnly?: boolean;
}

const LABEL_COLLATOR = new Intl.Collator("es-AR", { sensitivity: "base", numeric: true });

export function buildQuickFilters(counts: QuickFilterCounts, state: QuickFilterState): QuickFilter[] {
  const activeLabels = new Set(state.labelIds ?? []);
  const activeTags = new Set(state.commercialTags ?? []);
  const tagCount = new Map(counts.tags.map((t) => [t.key, t.count]));

  const labels: QuickFilter[] = [...counts.labels]
    .sort((a, b) => LABEL_COLLATOR.compare(a.name, b.name))
    .map((l) => ({ kind: "label", id: l.id, label: l.name, count: l.count, active: activeLabels.has(l.id), color: l.color }));
  const tags: QuickFilter[] = COMMERCIAL_TAGS.map((t) => ({
    kind: "tag",
    id: t.key,
    label: t.label,
    count: tagCount.get(t.key) ?? 0,
    active: activeTags.has(t.key),
  }));
  const extras: QuickFilter[] = [];
  if (counts.discount != null) extras.push({ kind: "discount", id: "discount", label: "Con descuento", count: counts.discount, active: !!state.hasDiscount });
  if (counts.favorites != null) extras.push({ kind: "favorites", id: "favorites", label: "Favoritos", count: counts.favorites, active: !!state.favoritesOnly });
  return [...labels, ...tags, ...extras].filter((f) => f.active || f.count > 0);
}

type RawParams = Record<string, string | string[] | undefined>;

const PARAM_OF: Record<QuickFilterKind, string> = { label: "label", tag: "tag", discount: "discount", favorites: "fav" };

/** Link que prende o apaga ese botón y deja todo lo demás (marca, rubro, búsqueda, vista). Vuelve a la página 1. */
export function quickFilterHref(basePath: string, params: RawParams, filter: Pick<QuickFilter, "kind" | "id" | "active">): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (key === "page" || value == null) continue;
    if (Array.isArray(value)) for (const v of value) next.append(key, v);
    else next.set(key, value);
  }
  const param = PARAM_OF[filter.kind];
  if (filter.kind === "label" || filter.kind === "tag") {
    const current = next.getAll(param).filter((v) => v !== filter.id);
    next.delete(param);
    for (const v of filter.active ? current : [...current, filter.id]) next.append(param, v);
  } else if (filter.active) {
    next.delete(param);
  } else {
    next.set(param, "1");
  }
  const query = next.toString();
  return query ? `${basePath}?${query}` : `${basePath}?all=1`;
}

const LABEL_ID = /^[A-Za-z0-9_-]{6,40}$/;
const MAX_PARAM_VALUES = 20;

function toList(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return (Array.isArray(v) ? v : [v])
    .flatMap((x) => x.split(","))
    .map((x) => x.trim())
    .filter(Boolean);
}

/** ?label= (ids de etiqueta), validados y sin repetir. */
export function parseLabelParam(v: string | string[] | undefined): string[] {
  return [...new Set(toList(v).filter((id) => LABEL_ID.test(id)))].slice(0, MAX_PARAM_VALUES);
}

/** ?tag= (carteles comerciales conocidos), sin repetir. */
export function parseTagParam(v: string | string[] | undefined): string[] {
  return [...new Set(toList(v).filter(isCommercialTag))];
}
