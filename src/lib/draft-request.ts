import { prisma } from "@/lib/prisma";
import type { CustomerRequest, CustomerRequestType } from "@prisma/client";

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

export async function getActiveDraftSummary(userId: string) {
  const draft = await prisma.customerRequest.findFirst({
    where: { userId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    include: { _count: { select: { items: true } } },
  });
  if (!draft) return null;
  const units = await prisma.customerRequestItem.aggregate({
    where: { requestId: draft.id, isAdminSuggestion: false },
    _sum: { quantity: true },
  });
  return {
    id: draft.id,
    itemCount: draft._count.items,
    unitCount: units._sum.quantity ?? 0,
    updatedAt: draft.updatedAt,
  };
}
