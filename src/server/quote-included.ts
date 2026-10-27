import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Lo que la ficha de un producto marca como «incluido en la caja» (soportes,
 * fuentes, rejillas) entra a la cotización como líneas sin cargo, debajo del
 * producto, en TODOS los flujos (rápida, editor, desde pedido). La línea queda
 * vinculada a su producto: sigue su cantidad y se va con él.
 */

type ParentItem = {
  id: string;
  quoteId: string;
  productId: string | null;
  quantity: Prisma.Decimal | number;
  sortOrder: number;
  groupId?: string | null;
  alternativeId?: string | null;
  description: string;
};

/** Crea las líneas incluidas de un producto recién agregado. Devuelve cuántas creó. */
export async function addIncludedItems(parent: ParentItem, opts: { unit?: string; defaultIva?: number } = {}): Promise<number> {
  if (!parent.productId) return 0;
  const included = await prisma.accessoryRelation.findMany({
    where: { productId: parent.productId, kind: "INCLUDED" },
    include: { accessoryProduct: { select: { id: true, normalizedName: true, ivaPercent: true, brand: { select: { name: true } } } } },
    orderBy: { createdAt: "asc" },
  });
  if (!included.length) return 0;
  const parentQty = Number(parent.quantity);
  const parentName = parent.description.split("\n")[0] ?? "";
  // Se hace lugar debajo del producto.
  await prisma.quoteItem.updateMany({
    where: { quoteId: parent.quoteId, sortOrder: { gt: parent.sortOrder } },
    data: { sortOrder: { increment: included.length } },
  });
  let sort = parent.sortOrder;
  for (const rel of included) {
    const perUnit = Math.max(1, rel.quantity ?? 1);
    const p = rel.accessoryProduct;
    sort += 1;
    await prisma.quoteItem.create({
      data: {
        quoteId: parent.quoteId,
        groupId: parent.groupId ?? null,
        alternativeId: parent.alternativeId ?? null,
        includedWithId: parent.id,
        includedPerUnit: perUnit,
        kind: "PRODUCT",
        productId: p.id,
        quantity: new Prisma.Decimal(parentQty * perUnit),
        unit: opts.unit || "u",
        description: [[p.brand?.name, p.normalizedName].filter(Boolean).join(" — "), `Incluido sin cargo (con ${parentName})`].join("\n"),
        unitPriceUsd: new Prisma.Decimal(0),
        lineTotalUsd: new Prisma.Decimal(0),
        priceOverridden: true,
        ivaRate: new Prisma.Decimal(p.ivaPercent != null ? Number(p.ivaPercent) : opts.defaultIva ?? 21),
        source: "CATALOG_SEARCH",
        notes: "Incluido",
        sortOrder: sort,
      },
    });
  }
  return included.length;
}

/** Al cambiar la cantidad de un producto, sus incluidos la siguen. */
export async function syncIncludedQuantities(parentId: string, parentQuantity: number): Promise<void> {
  const children = await prisma.quoteItem.findMany({ where: { includedWithId: parentId }, select: { id: true, includedPerUnit: true } });
  for (const child of children) {
    await prisma.quoteItem.update({
      where: { id: child.id },
      data: { quantity: new Prisma.Decimal(parentQuantity * Math.max(1, child.includedPerUnit ?? 1)) },
    });
  }
}

/** Al quitar un producto se van sus incluidos. */
export async function deleteIncludedItems(parentId: string): Promise<void> {
  await prisma.quoteItem.deleteMany({ where: { includedWithId: parentId } });
}
