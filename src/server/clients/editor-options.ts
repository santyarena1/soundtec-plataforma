/** Opciones del formulario de clientes (responsables, listas, marcas, categorías). */

import { prisma } from "@/lib/prisma";

export async function loadClientEditorOptions() {
  const [owners, priceLists, brands, categories] = await Promise.all([
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN", "STAFF"] }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.brand.findMany({ where: { isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.category.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return { owners, priceLists, brands, categories };
}
