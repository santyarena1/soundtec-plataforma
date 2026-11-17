/**
 * «Recién llegados» del inicio del portal: solo productos con foto propia.
 *
 * Algunas importaciones cargan el logo de la marca como foto del producto
 * (ej. James: la misma imagen en decenas de fichas). En la portada eso se ve
 * como una fila de logos, así que un producto sin foto propia no entra.
 */

/** Una misma imagen en más fichas que esto es un logo o un genérico, no una foto. */
export const SHARED_IMAGE_LIMIT = 5;

export interface RecentCandidate {
  id: string;
  images: Array<{ url: string }>;
}

export function pickRecentArrivals<T extends RecentCandidate>(
  rows: T[],
  usageByUrl: Map<string, number>,
  limit: number
): T[] {
  const out: T[] = [];
  const usedCovers = new Set<string>();
  for (const row of rows) {
    const cover = row.images[0]?.url?.trim();
    if (!cover) continue;
    if ((usageByUrl.get(cover) ?? 1) > SHARED_IMAGE_LIMIT) continue;
    if (usedCovers.has(cover)) continue;
    usedCovers.add(cover);
    out.push(row);
    if (out.length >= limit) break;
  }
  return out;
}
