/**
 * Imagen de tapa para listados.
 * Si nadie marcó "principal", se usa la más vieja. El detalle sí muestra todas.
 */
export const productCoverImageInclude = {
  orderBy: [{ isPrimary: "desc" as const }, { createdAt: "asc" as const }],
  take: 1,
};
