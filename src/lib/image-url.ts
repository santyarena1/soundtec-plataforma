/**
 * Las fotos de producto vienen de los sitios de cada fabricante en tamaño
 * completo (hasta 2500 px y ~1 MB cada una). Para mostrarlas en una tarjeta
 * se piden achicadas y en formato liviano al optimizador de imágenes (Next/
 * Vercel), que además las deja en caché. Así el catálogo carga mucho más rápido.
 *
 * Anchos válidos: los de imageSizes/deviceSizes de Next (96, 256, 384, 640, 828, 1080…).
 */
export type ImageWidth = 96 | 256 | 384 | 640 | 828 | 1080;

export function optimizedImage(url: string | null | undefined, width: ImageWidth, quality = 75): string | null {
  if (!url) return null;
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return value; // rutas propias, data: y otros: tal cual
  return `/_next/image?url=${encodeURIComponent(value)}&w=${width}&q=${quality}`;
}
