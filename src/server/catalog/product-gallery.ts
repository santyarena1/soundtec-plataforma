/**
 * Galería del producto en la base: leerla en orden y guardar un orden nuevo.
 * Las acciones de servidor chequean permisos antes de llamar acá.
 */
import { prisma } from "@/lib/prisma";
import {
  GALLERY_IMAGE_ORDER,
  GALLERY_VIDEO_ORDER,
  galleryKey,
  keysWithFirst,
  mergeGalleryMedia,
  planGalleryOrder,
  type GalleryItem,
} from "@/lib/product-media";

/** Fotos y videos del producto en el orden en que se muestran. */
export async function loadProductGallery(productId: string): Promise<GalleryItem[]> {
  const [images, videos] = await Promise.all([
    prisma.productImage.findMany({
      where: { productId },
      orderBy: GALLERY_IMAGE_ORDER,
      select: { id: true, url: true, alt: true, isPrimary: true, sortOrder: true, createdAt: true },
    }),
    prisma.productVideo.findMany({
      where: { productId },
      orderBy: GALLERY_VIDEO_ORDER,
      select: { id: true, provider: true, videoId: true, url: true, title: true, sortOrder: true, createdAt: true },
    }),
  ]);
  return mergeGalleryMedia(images, videos);
}

/**
 * Guarda el orden (lista de claves «image:id» / «video:id»). La primera foto
 * pasa a ser la principal. Devuelve false si la lista no coincide con la
 * galería actual (alguien agregó o quitó algo mientras tanto).
 */
export async function saveProductGalleryOrder(productId: string, keys: readonly string[]): Promise<boolean> {
  const items = await loadProductGallery(productId);
  const plan = planGalleryOrder(keys, {
    imageIds: items.filter((i) => i.kind === "image").map((i) => i.id),
    videoIds: items.filter((i) => i.kind === "video").map((i) => i.id),
  });
  if (!plan) return false;
  await prisma.$transaction([
    ...plan.images.map((img) =>
      prisma.productImage.update({ where: { id: img.id }, data: { sortOrder: img.sortOrder, isPrimary: img.isPrimary } })
    ),
    ...plan.videos.map((video) => prisma.productVideo.update({ where: { id: video.id }, data: { sortOrder: video.sortOrder } })),
  ]);
  return true;
}

/** Lleva una foto al principio de la galería (y la deja como principal). */
export async function moveProductImageFirst(productId: string, imageId: string): Promise<void> {
  const items = await loadProductGallery(productId);
  if (!items.some((item) => item.kind === "image" && item.id === imageId)) return;
  await saveProductGalleryOrder(productId, keysWithFirst(items, galleryKey({ kind: "image", id: imageId })));
}
