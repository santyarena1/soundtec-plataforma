/**
 * El catálogo muestra la foto del fabricante tal cual. Esas imágenes suelen
 * ser PNG de 2000 px o más, y la tarjeta en el celular mide unos 360 px.
 *
 * Estas URLs pasan por el optimizador de Next (WebP, cacheado). El ancho se
 * elige para que en una pantalla retina se vea igual que el original, sin
 * bajar de más. La ficha ampliada sigue usando el archivo original.
 *
 * Anchos que acepta el optimizador. Pedir otro devuelve 400.
 */
const ALLOWED_WIDTHS = [16, 32, 48, 64, 96, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];

export function optimizedImageUrl(src: string, width: number, quality = 75): string {
  if (!canOptimize(src)) return src;
  const w = ALLOWED_WIDTHS.find((n) => n >= width) ?? ALLOWED_WIDTHS[ALLOWED_WIDTHS.length - 1];
  const q = Math.min(100, Math.max(1, Math.round(quality)));
  const params = new URLSearchParams({ url: src, w: String(w), q: String(q) });
  return `/_next/image?${params.toString()}`;
}

function canOptimize(src: string): boolean {
  if (!src || src.startsWith("data:") || src.startsWith("blob:")) return false;
  if (src.includes("/_next/image?")) return false;
  if (/\.svg(?:$|\?)/i.test(src)) return false;
  return src.startsWith("https://") || src.startsWith("/");
}
