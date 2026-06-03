import { prisma } from "@/lib/prisma";
import type { CustomerRequest, CustomerRequestType } from "@prisma/client";
import { calculatePricesForProducts } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { getGlobalMarginPercent } from "@/lib/settings";

/** Solicitud en borrador más reciente del usuario, o una nueva si no hay. */
export async function getOrCreateActiveDraft(
  userId: string,
  options?: { type?: CustomerRequestType; migrateLegacyCart?: boolean }
): Promise<CustomerRequest> {
  const existing = await prisma.customerRequest.findFirst({
    where: { userId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) {
    if (options?.migrateLegacyCart) {
      await migrateLegacyCartIntoDraft(userId, existing.id);
    }
    return existing;
  }

  // Use the actual FK to the Client table; do NOT use the legacy userId fallback
  // from resolveCommercialClientId — passing a userId as clientId fails the FK constraint.
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { clientId: true } });
  const created = await prisma.customerRequest.create({
    data: {
      userId,
      clientId: user?.clientId ?? null,
      type: options?.type ?? "QUOTE",
      status: "DRAFT",
    },
  });

  if (options?.migrateLegacyCart !== false) {
    await migrateLegacyCartIntoDraft(userId, created.id);
  }

  return created;
}

/** Migra ítems del wishlist «Carrito» legacy al borrador y vacía ese wishlist. */
async function migrateLegacyCartIntoDraft(userId: string, requestId: string) {
  const cart = await prisma.wishlist.findFirst({
    where: { userId, name: "Carrito" },
    include: { items: true },
  });
  if (!cart || cart.items.length === 0) return;

  const existingInDraft = await prisma.customerRequestItem.findMany({
    where: { requestId, isAdminSuggestion: false },
    select: { productId: true, quantity: true, id: true },
  });
  const byProduct = new Map(existingInDraft.map((i) => [i.productId, i]));

  for (const item of cart.items) {
    const found = byProduct.get(item.productId);
    if (found) {
      await prisma.customerRequestItem.update({
        where: { id: found.id },
        data: { quantity: found.quantity + item.quantity },
      });
    } else {
      await prisma.customerRequestItem.create({
        data: {
          requestId,
          productId: item.productId,
          quantity: item.quantity,
          userNotes: item.notes,
        },
      });
    }
  }

  await prisma.wishlistItem.deleteMany({ where: { wishlistId: cart.id } });
}

export interface DraftSummary {
  id: string;
  itemCount: number;
  unitCount: number;
  subtotalUsd: number;
  updatedAt: Date;
  /** Últimos 5 productos agregados (más recientes primero) — para preview en mini-cart */
  recentItems: Array<{
    id: string;
    productId: string;
    name: string;
    quantity: number;
    unitPriceUsd: number;
    imageUrl: string | null;
    isAccessory: boolean;
  }>;
}

/**
 * Resumen del borrador activo del usuario con todo lo necesario para el
 * mini-cart flotante y banners de feedback: cantidad de items, unidades,
 * subtotal en USD calculado con lista de precios del cliente, y los últimos
 * 5 productos agregados para preview rápido.
 */
export async function getActiveDraftSummary(userId: string): Promise<DraftSummary | null> {
  const draft = await prisma.customerRequest.findFirst({
    where: { userId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    include: {
      items: {
        where: { isAdminSuggestion: false },
        orderBy: { createdAt: "desc" },
        include: {
          product: {
            include: {
              images: { where: { isPrimary: true }, take: 1 },
            },
          },
        },
      },
    },
  });
  if (!draft) return null;

  const items = draft.items;
  const unitCount = items.reduce((acc, it) => acc + it.quantity, 0);

  // Precios calculados con la lista del cliente. Si no es client comercial, usa global.
  let priceMap = new Map<string, { finalPriceUsd: number }>();
  if (items.length > 0) {
    const commercialClientId = await resolveCommercialClientId(userId);
    const globalMargin = await getGlobalMarginPercent();
    priceMap = await calculatePricesForProducts(
      items.map((i) => ({
        productId: i.product.id,
        baseCostUsd: Number(i.product.baseCostUsd),
        brandId: i.product.brandId,
        distributorId: i.product.distributorId,
        categoryId: i.product.categoryId,
        familyId: i.product.familyId,
        productDiscountPercent: i.product.discountPercent ? Number(i.product.discountPercent) : null,
        tariffDutyPercent: i.product.tariffDutyPercent ? Number(i.product.tariffDutyPercent) : null,
      })),
      commercialClientId,
      globalMargin
    );
  }

  const subtotalUsd = items.reduce((acc, it) => {
    const unit = priceMap.get(it.product.id)?.finalPriceUsd ?? 0;
    return acc + unit * it.quantity;
  }, 0);

  return {
    id: draft.id,
    itemCount: items.length,
    unitCount,
    subtotalUsd,
    updatedAt: draft.updatedAt,
    recentItems: items.slice(0, 5).map((it) => ({
      id: it.id,
      productId: it.product.id,
      name: it.product.normalizedName,
      quantity: it.quantity,
      unitPriceUsd: priceMap.get(it.product.id)?.finalPriceUsd ?? 0,
      imageUrl: it.product.images[0]?.url ?? null,
      isAccessory: it.product.kind === "ACCESORIO",
    })),
  };
}
