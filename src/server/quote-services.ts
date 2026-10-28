import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isTangoTreeActive } from "@/lib/tango-tree-db";
import { ensureNode } from "@/server/category-proposals";

/**
 * Servicios para cotizar (instalación, visitas, horas, mantenimiento…). Tienen
 * precio de venta fijo (o ninguno: se carga a mano en cada cotización). No son
 * productos: no aparecen en el catálogo ni en el portal; los usa el equipo al
 * cotizar y los administra un admin.
 */
const DATA_FILE = join(process.cwd(), "data", "servicios", "servicios-2026-10.json");

type ServiceFile = Array<{ sourceKey: string; name: string; description: string | null; priceUsd: number | null; ivaPercent: number; deliveryText: string | null; tangoPath: string }>;

/** La primera vez carga los servicios del Excel. Idempotente (sourceKey). */
export async function ensureQuoteServicesLoaded(): Promise<number> {
  if ((await prisma.quoteService.count()) > 0) return 0;
  const rows = JSON.parse(await readFile(DATA_FILE, "utf8")) as ServiceFile;
  // Rubro en el árbol de Tango (SERVICIOS > INSTALACION…), solo si el árbol ya está cargado:
  // crear rubros sueltos antes activaría el árbol a medias.
  const nodeByPath = new Map<string, string>();
  if (await isTangoTreeActive(prisma)) {
    for (const path of new Set(rows.map((r) => r.tangoPath))) nodeByPath.set(path, await ensureNode(path));
  }
  const r = await prisma.quoteService.createMany({
    data: rows.map((s) => ({
      sourceKey: s.sourceKey,
      name: s.name,
      description: s.description,
      priceUsd: s.priceUsd == null ? null : new Prisma.Decimal(s.priceUsd),
      ivaPercent: new Prisma.Decimal(s.ivaPercent),
      deliveryText: s.deliveryText,
      categoryId: nodeByPath.get(s.tangoPath) ?? null,
    })),
    skipDuplicates: true,
  });
  return r.count;
}

/** Texto del ítem en la cotización: nombre arriba y el detalle completo abajo. */
export function serviceItemDescription(s: { name: string; description: string | null }): string {
  return [s.name.trim(), s.description?.trim()].filter(Boolean).join("\n");
}

/** Buscar servicios activos por nombre o detalle (para los buscadores de cotización). */
export async function searchQuoteServices(query: string, take = 8) {
  const q = query.trim();
  if (q.length < 2) return [];
  await ensureQuoteServicesLoaded();
  const words = q.split(/\s+/).filter((w) => w.length >= 2);
  return prisma.quoteService.findMany({
    where: {
      isActive: true,
      AND: words.map((w) => ({ OR: [{ name: { contains: w, mode: "insensitive" as const } }, { description: { contains: w, mode: "insensitive" as const } }] })),
    },
    orderBy: { name: "asc" },
    take,
  });
}

/** Si los servicios se cargaron antes que el árbol de Tango, les pone el rubro cuando el árbol ya está. */
export async function linkServiceCategories(): Promise<void> {
  const missing = await prisma.quoteService.findMany({ where: { categoryId: null, sourceKey: { not: null } }, select: { id: true, sourceKey: true } });
  if (!missing.length || !(await isTangoTreeActive(prisma))) return;
  const rows = JSON.parse(await readFile(DATA_FILE, "utf8")) as ServiceFile;
  const pathByKey = new Map(rows.map((r) => [r.sourceKey, r.tangoPath]));
  for (const s of missing) {
    const path = s.sourceKey ? pathByKey.get(s.sourceKey) : undefined;
    if (path) await prisma.quoteService.update({ where: { id: s.id }, data: { categoryId: await ensureNode(path) } });
  }
}
