/**
 * Series del fabricante desde los importadores y sincronizaciones: reemplaza el
 * viejo destino «Familia (FK)». Nunca pisa una serie elegida a mano
 * (`lineLocked`) ni una ya asignada.
 */
import type { Prisma, ProductLineSource } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { detectProductSeries, normalizeSeriesName, seriesSlug } from "@/lib/product-lines/detect";

/** Base o transacción (las sincronizaciones lo llaman dentro de su transacción). */
type Db = Pick<Prisma.TransactionClient, "product" | "productLine">;

/** Busca la serie (marca + nombre normalizado) o la crea. null si el nombre no sirve. */
export async function ensureSeries(brandId: string, rawName: string, source: ProductLineSource, db: Db = prisma): Promise<string | null> {
  const name = normalizeSeriesName(rawName);
  const slug = name ? seriesSlug(name) : "";
  if (!name || !slug) return null;
  const row = await db.productLine.upsert({
    where: { brandId_slug: { brandId, slug } },
    update: {},
    create: { brandId, name, slug, source },
    select: { id: true },
  });
  return row.id;
}

/**
 * Pone la serie a un producto que todavía no tiene: la indicada por el
 * importador (`explicitName`) o la que se detecta de sus datos (ruta de
 * crestron.com, atributo del portal Sonance, `line`, prefijo de modelo).
 * Devuelve el nombre asignado o null.
 */
export async function assignSeriesIfMissing(productId: string, explicitName?: string | null, db: Db = prisma): Promise<string | null> {
  const p = await db.product.findUnique({
    where: { id: productId },
    select: {
      lineId: true,
      lineLocked: true,
      brandId: true,
      modelNumber: true,
      supplierSku: true,
      line: true,
      sourceCategoryPath: true,
      sourceMetadata: true,
      brand: { select: { name: true } },
    },
  });
  if (!p || !p.brandId || p.lineId || p.lineLocked) return null;
  let name: string | null = null;
  let source: ProductLineSource = "MANUAL";
  if (explicitName?.trim()) {
    name = explicitName;
  } else {
    const d = detectProductSeries({
      brandName: p.brand?.name ?? null,
      modelNumber: p.modelNumber,
      supplierSku: p.supplierSku,
      line: p.line,
      sourceCategoryPath: p.sourceCategoryPath,
      sourceMetadata: p.sourceMetadata,
    });
    if (d.kind !== "series") return null;
    name = d.name;
    source = d.source;
  }
  const lineId = await ensureSeries(p.brandId, name, source, db);
  if (!lineId) return null;
  const r = await db.product.updateMany({ where: { id: productId, lineId: null, lineLocked: false }, data: { lineId } });
  return r.count ? normalizeSeriesName(name) : null;
}
