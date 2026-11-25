/**
 * Ubicación de las imágenes fijas de la cotización (marcas, ISO). Módulo sin base
 * de datos: lo usan el editor y la vista previa en el navegador. Antes vivía en
 * quote-defaults, que importa Prisma y la configuración, y arrastraba eso al bundle del cliente.
 */
export type ImagePlacement = { width: number; align: "left" | "center" | "right" };

export const DEFAULT_BRANDS_PLACEMENT: ImagePlacement = { width: 100, align: "center" };
export const DEFAULT_ISO_PLACEMENT: ImagePlacement = { width: 30, align: "center" };

/** El ancho va en % del ancho útil de la hoja, así la imagen sigue fluyendo con el texto. */
export function parsePlacement(width: string, align: string, fallbackWidth: number): ImagePlacement {
  const parsed = Number(width);
  const safeWidth = Number.isFinite(parsed) && parsed >= 10 && parsed <= 100 ? parsed : fallbackWidth;
  const safeAlign = align === "left" || align === "right" ? align : "center";
  return { width: safeWidth, align: safeAlign };
}

export function resolveImagePlacement(
  placement: ImagePlacement | null | undefined,
  fallback: ImagePlacement
): ImagePlacement {
  if (!placement || typeof placement.width !== "number") return fallback;
  return parsePlacement(String(placement.width), placement.align || fallback.align, fallback.width);
}
