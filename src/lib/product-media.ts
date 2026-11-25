/**
 * Galería del producto: fotos y videos en un solo orden.
 *
 * Fotos (ProductImage) y videos (ProductVideo) comparten `sortOrder`. Lo que
 * nunca se ordenó a mano tiene 9999 y queda al final, en el orden de siempre
 * (la principal primero, después por antigüedad). La «principal» es la
 * primera FOTO del orden: es la tapa de listados, PDF y cotizaciones, y un
 * video no sirve de tapa.
 */

export const UNSORTED = 9999;

export interface GalleryImageItem {
  kind: "image";
  id: string;
  url: string;
  alt: string | null;
  isPrimary: boolean;
  sortOrder: number;
  createdAt: Date | string;
}

export interface GalleryVideoItem {
  kind: "video";
  id: string;
  provider: string;
  videoId: string;
  url: string;
  title: string | null;
  sortOrder: number;
  createdAt: Date | string;
}

export type GalleryItem = GalleryImageItem | GalleryVideoItem;

/** Orden de las fotos en las consultas de Prisma (igual criterio que `sortGallery`). */
export const GALLERY_IMAGE_ORDER = [
  { sortOrder: "asc" as const },
  { isPrimary: "desc" as const },
  { createdAt: "asc" as const },
];

export const GALLERY_VIDEO_ORDER = [{ sortOrder: "asc" as const }, { createdAt: "asc" as const }];

function time(value: Date | string): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : 0;
}

function compareItems(a: GalleryItem, b: GalleryItem): number {
  if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
  // Sin orden manual: fotos antes que videos y la principal adelante.
  if (a.kind !== b.kind) return a.kind === "image" ? -1 : 1;
  if (a.kind === "image" && b.kind === "image" && a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
  const byDate = time(a.createdAt) - time(b.createdAt);
  if (byDate !== 0) return byDate;
  return a.id.localeCompare(b.id);
}

/** Fotos y videos en el orden en que se muestran. No modifica las listas recibidas. */
export function sortGallery(items: readonly GalleryItem[]): GalleryItem[] {
  return [...items].sort(compareItems);
}

export function mergeGalleryMedia(
  images: ReadonlyArray<Omit<GalleryImageItem, "kind">>,
  videos: ReadonlyArray<Omit<GalleryVideoItem, "kind">>
): GalleryItem[] {
  return sortGallery([
    ...images.map((img) => ({ ...img, kind: "image" as const })),
    ...videos.map((video) => ({ ...video, kind: "video" as const })),
  ]);
}

/** Clave única de un elemento de la galería: «image:<id>» o «video:<id>». */
export function galleryKey(item: Pick<GalleryItem, "kind" | "id">): string {
  return `${item.kind}:${item.id}`;
}

export function parseGalleryKey(key: string): { kind: "image" | "video"; id: string } | null {
  const match = /^(image|video):([A-Za-z0-9_-]{1,64})$/.exec(key);
  return match ? { kind: match[1] as "image" | "video", id: match[2]! } : null;
}

/** Mueve un elemento de `from` a `to` (índices). Devuelve una lista nueva. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= list.length || to < 0 || to >= list.length || from === to) return [...list];
  const next = [...list];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export interface GalleryOrderPlan {
  images: Array<{ id: string; sortOrder: number; isPrimary: boolean }>;
  videos: Array<{ id: string; sortOrder: number }>;
}

/**
 * Lo que hay que guardar para un orden dado (lista de claves). La primera foto
 * queda como principal. Claves repetidas, desconocidas o faltantes invalidan
 * el pedido: el orden tiene que nombrar exactamente lo que hay en la galería.
 */
export function planGalleryOrder(
  keys: readonly string[],
  current: { imageIds: readonly string[]; videoIds: readonly string[] }
): GalleryOrderPlan | null {
  const expected = new Set([...current.imageIds.map((id) => `image:${id}`), ...current.videoIds.map((id) => `video:${id}`)]);
  if (keys.length !== expected.size || new Set(keys).size !== keys.length) return null;
  if (keys.some((key) => !expected.has(key))) return null;
  const plan: GalleryOrderPlan = { images: [], videos: [] };
  let primaryTaken = false;
  keys.forEach((key, index) => {
    const parsed = parseGalleryKey(key)!;
    if (parsed.kind === "image") {
      plan.images.push({ id: parsed.id, sortOrder: index, isPrimary: !primaryTaken });
      primaryTaken = true;
    } else {
      plan.videos.push({ id: parsed.id, sortOrder: index });
    }
  });
  return plan;
}

/** Orden con un elemento llevado al principio (para «Marcar como principal»). */
export function keysWithFirst(items: readonly GalleryItem[], key: string): string[] {
  const keys = items.map(galleryKey);
  const index = keys.indexOf(key);
  return index < 0 ? keys : moveItem(keys, index, 0);
}
