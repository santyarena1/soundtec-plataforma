"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { normalizeVideoUrl } from "@/lib/product-video";
import { saveProductGalleryOrder } from "@/server/catalog/product-gallery";

type Result = { ok: true } | { ok: false; error: string };

const MAX_VIDEOS_PER_PRODUCT = 20;

function revalidateGallery(productId: string) {
  revalidatePath(`/admin/products/${productId}`);
  revalidatePath(`/portal/products/${productId}`);
  revalidatePath(`/catalogo/${productId}`);
}

async function productExists(productId: string): Promise<boolean> {
  if (!productId || productId.length > 64) return false;
  return Boolean(await prisma.product.findUnique({ where: { id: productId }, select: { id: true } }));
}

/** Agrega un video de YouTube o Instagram pegando el link. Queda al final de la galería. */
export async function addProductVideoAction(input: { productId: string; url: string; title?: string }): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const productId = String(input?.productId || "");
  if (!(await productExists(productId))) return { ok: false, error: "Producto no encontrado." };
  const parsed = normalizeVideoUrl(String(input?.url || ""));
  if (!parsed.ok) return parsed;

  const [count, duplicate] = await Promise.all([
    prisma.productVideo.count({ where: { productId } }),
    prisma.productVideo.findFirst({ where: { productId, provider: parsed.provider, videoId: parsed.videoId }, select: { id: true } }),
  ]);
  if (duplicate) return { ok: false, error: "Ese video ya está en la galería." };
  if (count >= MAX_VIDEOS_PER_PRODUCT) return { ok: false, error: `Hay ${MAX_VIDEOS_PER_PRODUCT} videos cargados: quitá alguno antes de sumar otro.` };

  const title = String(input?.title || "").trim().slice(0, 200) || null;
  await prisma.productVideo.create({
    data: { productId, provider: parsed.provider, videoId: parsed.videoId, url: parsed.url, title },
  });
  revalidateGallery(productId);
  return { ok: true };
}

export async function deleteProductVideoAction(input: { productId: string; id: string }): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const productId = String(input?.productId || "");
  const id = String(input?.id || "");
  if (!productId || !id) return { ok: false, error: "Falta el video." };
  const removed = await prisma.productVideo.deleteMany({ where: { id, productId } });
  if (!removed.count) return { ok: false, error: "Ese video ya no está en la galería." };
  revalidateGallery(productId);
  return { ok: true };
}

/** Guarda el orden de la galería (fotos y videos). La primera foto queda como principal. */
export async function reorderProductMediaAction(input: { productId: string; keys: string[] }): Promise<Result> {
  await requireStaff("products.edit", { costs: true });
  const productId = String(input?.productId || "");
  const keys = Array.isArray(input?.keys) ? input.keys.map(String).slice(0, 500) : [];
  if (!(await productExists(productId))) return { ok: false, error: "Producto no encontrado." };
  const saved = await saveProductGalleryOrder(productId, keys);
  if (!saved) return { ok: false, error: "La galería cambió mientras la ordenabas. Recargá la página y volvé a ordenar." };
  revalidateGallery(productId);
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
  return { ok: true };
}
