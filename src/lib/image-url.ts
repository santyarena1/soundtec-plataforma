/**
 * Las fotos de producto vienen de los sitios de cada fabricante en tamaño
 * completo (hasta 2500 px y ~1 MB cada una). Para mostrarlas en una tarjeta
 * se piden achicadas y en formato liviano al optimizador de imágenes (Next/
 * Vercel), que además las deja en caché. Así el catálogo carga mucho más rápido.
 *
 * Anchos válidos: los de imageSizes/deviceSizes de Next (96, 256, 384, 640, 828, 1080…).
 */
import imageHosts from "./image-hosts.json";

const HOSTS: string[] = imageHosts.hosts;

/** ¿El optimizador acepta este dominio? (misma lista que next.config) */
export function isOptimizableHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return HOSTS.some((pattern) => (pattern.startsWith("*.") ? host.endsWith(pattern.slice(1)) : host === pattern));
}

export type ImageWidth = 96 | 256 | 384 | 640 | 828 | 1080;

export function optimizedImage(url: string | null | undefined, width: ImageWidth, quality = 75): string | null {
  if (!url) return null;
  const value = url.trim();
  if (!/^https?:\/\//i.test(value)) return value; // rutas propias, data: y otros: tal cual
  let host = "";
  try {
    host = new URL(value).hostname;
  } catch {
    return value;
  }
  // Archivos privados de cotizaciones: el optimizador no tiene sesión para pedirlos.
  if (value.includes("/api/files/quotes/")) return value;
  // Fuera de la lista se muestra directo: el optimizador no le pide fotos a cualquier sitio.
  if (!isOptimizableHost(host)) return value;
  return `/_next/image?url=${encodeURIComponent(value)}&w=${width}&q=${quality}`;
}
