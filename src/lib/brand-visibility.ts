import type { Prisma } from "@prisma/client";

/**
 * Excluye productos de marcas ocultas desde Admin → Marcas. Los productos sin
 * marca siguen visibles (NOT sobre una relación nula da verdadero).
 */
export const VISIBLE_BRAND_WHERE: Prisma.ProductWhereInput = {
  NOT: { brand: { is: { hiddenFromCatalog: true } } },
};
