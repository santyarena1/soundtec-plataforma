import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

const CACHE_MS = 5 * 60_000;
let cached: { value: boolean; at: number } | null = null;

/**
 * ¿Ya está cargado el árbol de rubros de Tango? Mientras esté, la clasificación
 * es la de Tango: las sincronizaciones e importaciones no pisan la categoría de
 * un producto ni crean categorías sueltas por nombre.
 */
export async function isTangoTreeActive(db: Db): Promise<boolean> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.value;
  const value = (await db.category.count({ where: { tangoPath: { not: null }, isActive: true }, take: 1 })) > 0;
  cached = { value, at: Date.now() };
  return value;
}
