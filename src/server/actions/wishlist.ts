"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth-helpers";
import { isProductVisibleToClient } from "@/lib/pricing";
import { resolveCommercialClientId } from "@/lib/client-context";
import { accessoryAckNote, evaluateAccessoryPolicy } from "@/lib/accessory-context";

async function ensureDefaultWishlist(userId: string) {
  const existing = await prisma.wishlist.findFirst({ where: { userId, isDefault: true } });
  if (existing) return existing;
  return prisma.wishlist.create({
    data: { userId, name: "Favoritos", isDefault: true },
  });
}

async function ensureCartWishlist(userId: string) {
  const existing = await prisma.wishlist.findFirst({
    where: { userId, name: "Carrito" },
  });
  if (existing) return existing;
  return prisma.wishlist.create({
    data: { userId, name: "Carrito", isDefault: false },
  });
}

async function canUserSeeProduct(userId: string, role: string, productId: string) {
  if (role !== "CLIENT") return true;
  const p = await prisma.product.findUnique({
    where: { id: productId },
    select: { id: true, brandId: true, categoryId: true, distributorId: true, familyId: true, isActive: true },
  });
  if (!p || !p.isActive) return false;
  const commercialClientId = await resolveCommercialClientId(userId);
  if (!commercialClientId) return false;
  return isProductVisibleToClient(
    {
      id: p.id,
      brandId: p.brandId,
      categoryId: p.categoryId,
      distributorId: p.distributorId,
      familyId: p.familyId,
    },
    commercialClientId
  );
}

const toggleSchema = z.object({ productId: z.string().min(1) });

export async function toggleFavorite(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = toggleSchema.safeParse({ productId: formData.get("productId") });
  if (!parsed.success) return { ok: false, error: "Producto inválido" };

  const wishlist = await ensureDefaultWishlist(user.id);
  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId: parsed.data.productId } },
  });

  if (existing) {
    await prisma.wishlistItem.delete({ where: { id: existing.id } });
  } else {
    await prisma.wishlistItem.create({
      data: { wishlistId: wishlist.id, productId: parsed.data.productId, quantity: 1 },
    });
  }

  revalidatePath("/portal/products");
  revalidatePath(`/portal/products/${parsed.data.productId}`);
  revalidatePath("/portal/wishlist");
  return { ok: true };
}

const createListSchema = z.object({ name: z.string().min(2).max(80) });

export async function createWishlist(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = createListSchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) return;

  await prisma.wishlist.create({
    data: { userId: user.id, name: parsed.data.name, isDefault: false },
  });
  revalidatePath("/portal/lists");
}

const addToListSchema = z.object({
  wishlistId: z.string().min(1),
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
});

export async function addToList(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const parsed = addToListSchema.safeParse({
    wishlistId: formData.get("wishlistId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const wishlist = await prisma.wishlist.findFirst({
    where: { id: parsed.data.wishlistId, userId: user.id },
  });
  if (!wishlist) return { ok: false, error: "Lista no encontrada" };

  await prisma.wishlistItem.upsert({
    where: { wishlistId_productId: { wishlistId: wishlist.id, productId: parsed.data.productId } },
    update: { quantity: parsed.data.quantity },
    create: {
      wishlistId: wishlist.id,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
    },
  });
  revalidatePath("/portal/lists");
  revalidatePath(`/portal/lists/${wishlist.id}`);
  return { ok: true };
}

const removeSchema = z.object({ itemId: z.string().min(1) });

export async function removeWishlistItem(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = removeSchema.safeParse({ itemId: formData.get("itemId") });
  if (!parsed.success) return;

  await prisma.wishlistItem.deleteMany({
    where: { id: parsed.data.itemId, wishlist: { userId: user.id } },
  });
  revalidatePath("/portal/wishlist");
  revalidatePath("/portal/lists");
  revalidatePath("/portal/cart");
}

const cartAddSchema = z.object({
  productId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999).default(1),
});

export async function addToCart(formData: FormData): Promise<{
  ok: boolean;
  error?: string;
  requiresAcknowledgement?: boolean;
  warningMessage?: string;
  compatiblePrimaries?: { id: string; name: string }[];
  detail?: {
    productName: string;
    addedQty: number;
    itemQty: number;
    cartItemsTotal: number;
    cartUnitsTotal: number;
  };
}> {
  const user = await requireUser();
  const parsed = cartAddSchema.safeParse({
    productId: formData.get("productId"),
    quantity: formData.get("quantity") || 1,
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const ack =
    formData.get("ackAccessoryWarning") === "true" || formData.get("ackAccessoryWarning") === "on";

  const visible = await canUserSeeProduct(user.id, user.role, parsed.data.productId);
  if (!visible) return { ok: false, error: "Producto no disponible para tu cuenta." };

  const product = await prisma.product.findUnique({
    where: { id: parsed.data.productId },
    select: { id: true, normalizedName: true },
  });
  if (!product) return { ok: false, error: "Producto no encontrado." };

  const policy = await evaluateAccessoryPolicy({ productId: parsed.data.productId });
  if (policy.blocked) return { ok: false, error: policy.blockedMessage };
  if (policy.needsAcknowledgement && !ack) {
    return {
      ok: false,
      requiresAcknowledgement: true,
      warningMessage: policy.warningMessage,
      compatiblePrimaries: policy.compatiblePrimaries,
    };
  }

  const cart = await ensureCartWishlist(user.id);
  const ackNote =
    policy.needsAcknowledgement && ack ? accessoryAckNote(policy.compatiblePrimaries) : null;
  const existing = await prisma.wishlistItem.findUnique({
    where: { wishlistId_productId: { wishlistId: cart.id, productId: parsed.data.productId } },
  });
  let itemQuantity = parsed.data.quantity;
  if (existing) {
    itemQuantity = existing.quantity + parsed.data.quantity;
    await prisma.wishlistItem.update({
      where: { id: existing.id },
      data: {
        quantity: itemQuantity,
        notes: ackNote ? [existing.notes, ackNote].filter(Boolean).join(" | ") : existing.notes,
      },
    });
  } else {
    await prisma.wishlistItem.create({
      data: {
        wishlistId: cart.id,
        productId: parsed.data.productId,
        quantity: parsed.data.quantity,
        notes: ackNote,
      },
    });
  }
  const cartItems = await prisma.wishlistItem.findMany({
    where: { wishlistId: cart.id },
    select: { quantity: true },
  });
  const cartItemsTotal = cartItems.length;
  const cartUnitsTotal = cartItems.reduce((acc, i) => acc + i.quantity, 0);
  revalidatePath("/portal/products");
  revalidatePath("/portal/cart");
  return {
    ok: true,
    detail: {
      productName: product.normalizedName,
      addedQty: parsed.data.quantity,
      itemQty: itemQuantity,
      cartItemsTotal,
      cartUnitsTotal,
    },
  };
}

const cartUpdateSchema = z.object({
  itemId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(9999),
});

export async function updateCartItemQuantity(formData: FormData): Promise<void> {
  const user = await requireUser();
  const parsed = cartUpdateSchema.safeParse({
    itemId: formData.get("itemId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) return;

  await prisma.wishlistItem.updateMany({
    where: { id: parsed.data.itemId, wishlist: { userId: user.id, name: "Carrito" } },
    data: { quantity: parsed.data.quantity },
  });
  revalidatePath("/portal/cart");
}

export async function clearCart(formData: FormData): Promise<void> {
  const user = await requireUser();
  const wishlistId = String(formData.get("wishlistId") || "");
  if (!wishlistId) return;
  await prisma.wishlistItem.deleteMany({
    where: { wishlistId, wishlist: { userId: user.id, name: "Carrito" } },
  });
  revalidatePath("/portal/cart");
}
