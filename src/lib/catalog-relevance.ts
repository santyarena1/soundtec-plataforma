/**
 * Orden "Más relevantes" del catálogo.
 *
 * La señal son las vistas de ficha (visitantes únicos por producto, últimos
 * 90 días). Hasta juntar MIN_VIEWS_FOR_RELEVANCE vistas no alcanza para
 * ordenar por eso, y el catálogo muestra Crestron Home primero y de mayor a
 * menor precio. Ese mismo criterio desempata cuando sí hay datos.
 */

export const MIN_VIEWS_FOR_RELEVANCE = 300;
export const RELEVANCE_WINDOW_DAYS = 90;

export interface RelevanceItem {
  id: string;
  isCrestronHomeCompatible: boolean;
  price: number;
}

export function hasEnoughViews(totalViews: number): boolean {
  return totalViews >= MIN_VIEWS_FOR_RELEVANCE;
}

export function compareByRelevance(views: ReadonlyMap<string, number>, enough: boolean) {
  return (a: RelevanceItem, b: RelevanceItem): number => {
    if (enough) {
      const diff = (views.get(b.id) ?? 0) - (views.get(a.id) ?? 0);
      if (diff) return diff;
    }
    const home = Number(b.isCrestronHomeCompatible) - Number(a.isCrestronHomeCompatible);
    return home || b.price - a.price;
  };
}
