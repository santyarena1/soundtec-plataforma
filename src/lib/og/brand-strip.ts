import sharp from "sharp";
import { getCatalogBrands } from "@/lib/catalog-brands";
import { cardImage, loadImageBytes, type CardImage } from "@/lib/og/card";

const STRIP_SIZE = 6;

/** Logos blancos (pensados para fondo oscuro): sobre la tira blanca no se verían. */
async function isMostlyWhite(bytes: Buffer): Promise<boolean> {
  try {
    const { data } = await sharp(bytes).ensureAlpha().resize({ width: 120, fit: "inside" }).raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3]! < 128) continue;
      sum += (data[i]! + data[i + 1]! + data[i + 2]!) / 3;
      count += 1;
    }
    return count === 0 || sum / count > 225;
  } catch {
    return true;
  }
}

/** Logos de las marcas con más productos, para la fila de abajo de las tarjetas generales. */
export async function brandStrip(origin: string): Promise<CardImage[]> {
  const brands = (await getCatalogBrands()).filter((b) => b.logoUrl && b.count > 0).sort((a, b) => b.count - a.count);
  const images: CardImage[] = [];
  for (const brand of brands) {
    if (images.length >= STRIP_SIZE) break;
    const bytes = await loadImageBytes(brand.logoUrl, origin);
    if (!bytes || (await isMostlyWhite(bytes))) continue;
    const img = await cardImage(bytes, { width: 120, height: 40 });
    if (img) images.push(img);
  }
  return images;
}
