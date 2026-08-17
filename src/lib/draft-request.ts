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
/**
 * Resumen liviano para el mini-cart flotante.
 *
 * Optimización clave para velocidad del portal: hacemos UN solo aggregate query
 * para contadores (sin traer rows), y otro pequeño para los 5 items recientes
 * (con sus precios pre-calculados). Esto reduce el costo de render de TODAS
 * las páginas del portal (porque el mini-cart está en el layout).
 *
 * Antes: traíamos los N items del draft + calculatePricesForProducts(N) cada
 * página. Para drafts grandes (50+ items) cada page-load gastaba 100-500ms.
 *
 * Ahora: el subtotal del draft se calcula con un agregate SQL contra los
 * precios pre-resueltos. Solo los 5 items más recientes pasan por el motor
 * de pricing completo.
 */
export async function getActiveDraftSummary(userId: string): Promise<DraftSummary | null> {
  const draft = await prisma.customerRequest.findFirst({
    where: { userId, status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, updatedAt: true },
  });
  if (!draft) return null;

  // Contadores rápidos: aggregate sin traer rows.
  const [itemAgg, recentItemsRaw] = await Promise.all([
    prisma.customerRequestItem.aggregate({
      where: { requestId: draft.id, isAdminSuggestion: false },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
    prisma.customerRequestItem.findMany({
      where: { requestId: draft.id, isAdminSuggestion: false },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        product: {
          select: {
            id: true,
            normalizedName: true,
            kind: true,
            baseCostUsd: true,
            brandId: true,
            distributorId: true,
            categoryId: true,
            familyId: true,
            discountPercent: true,
            tariffDutyPercent: true,
            coefNac: true,
            coefVta: true,
            coefVtaFob: true,
            ivaPercent: true,
            impIntPercent: true,
            images: { where: { isPrimary: true }, take: 1, select: { url: true } },
          },
        },
      },
    }),
  ]);

  const itemCount = itemAgg._count._all;
  const unitCount = itemAgg._sum.quantity ?? 0;

  // Subtotal: para evitar el costo de calcular precios de TODOS los items en
  // cada page-load, hacemos un SQL agregate aproximado: suma de
  // (baseCostUsd * (1 + globalMargin/100) * quantity). Es una APROXIMACIÓN
  // del subtotal (no aplica descuentos por cliente ni reglas de margen), pero
  // suficiente para el mini-cart. El subtotal preciso se ve al abrir la ficha.
  const globalMargin = await getGlobalMarginPercent();
  const factor = 1 + globalMargin / 100;
  // Suma rápida vía raw SQL — un único viaje a la DB.
  const sumRow = await prisma.$queryRaw<Array<{ total: number | null }>>`
    SELECT COALESCE(SUM("baseCostUsd"::numeric * "CustomerRequestItem"."quantity" * ${factor}), 0)::float8 AS total
    FROM "CustomerRequestItem"
    JOIN "Product" ON "Product"."id" = "CustomerRequestItem"."productId"
    WHERE "CustomerRequestItem"."requestId" = ${draft.id}
      AND "CustomerRequestItem"."isAdminSuggestion" = false
  `;
  const subtotalUsd = Number(sumRow[0]?.total ?? 0);

  // Precios precisos solo para los 5 items que se muestran en el preview.
  let recentPriceMap = new Map<string, { finalPriceUsd: number }>();
  if (recentItemsRaw.length > 0) {
    const commercialClientId = await resolveCommercialClientId(userId);
    recentPriceMap = await calculatePricesForProducts(
      recentItemsRaw.map((i) => ({
        productId: i.product.id,
        baseCostUsd: Number(i.product.baseCostUsd),
        brandId: i.product.brandId,
        distributorId: i.product.distributorId,
        categoryId: i.product.categoryId,
        familyId: i.product.familyId,
        productDiscountPercent: i.product.discountPercent ? Number(i.product.discountPercent) : null,
        tariffDutyPercent: i.product.tariffDutyPercent ? Number(i.product.tariffDutyPercent) : null,
        coefNac: i.product.coefNac != null ? Number(i.product.coefNac) : null,
        coefVta: i.product.coefVta != null ? Number(i.product.coefVta) : null,
        coefVtaFob: i.product.coefVtaFob != null ? Number(i.product.coefVtaFob) : null,
        ivaPercent: i.product.ivaPercent != null ? Number(i.product.ivaPercent) : null,
        impIntPercent: i.product.impIntPercent != null ? Number(i.product.impIntPercent) : null,
      })),
      commercialClientId,
      globalMargin
    );
  }

  return {
    id: draft.id,
    itemCount,
    unitCount,
    subtotalUsd,
    updatedAt: draft.updatedAt,
    recentItems: recentItemsRaw.map((it) => ({
      id: it.id,
      productId: it.product.id,
      name: it.product.normalizedName,
      quantity: it.quantity,
      unitPriceUsd: recentPriceMap.get(it.product.id)?.finalPriceUsd ?? 0,
      imageUrl: it.product.images[0]?.url ?? null,
      isAccessory: it.product.kind === "ACCESORIO",
    })),
  };
}
