import { prisma } from "@/lib/prisma";
import { DAY_MS } from "@/lib/dashboard/periods";
import { NO_PRICE_WHERE, NOT_TRANSLATED_WHERE } from "@/lib/admin-product-where";
import { countUncategorizedProducts } from "@/server/uncategorized";
import type { DashboardViewer } from "./viewer";

export type HealthCount = { key: string; label: string; help: string; count: number; href: string };

export type PriceChange = { productId: string; name: string; source: string; from: number; to: number; pct: number; at: Date };

export type PriceChanges = {
  ups: number;
  downs: number;
  /** Variación promedio de las subas y de las bajas (%). */
  avgUpPct: number | null;
  avgDownPct: number | null;
  biggest: PriceChange[];
  runs: number;
};

export type CatalogHealth = { active: number; counts: HealthCount[]; priceChanges: PriceChanges | null };

const PRICE_WINDOW_DAYS = 7;

/** Productos activos a los que les falta algo, con el link al listado ya filtrado. */
export async function loadCatalogHealth(viewer: DashboardViewer, now: Date = new Date()): Promise<CatalogHealth> {
  const active = { isActive: true };
  const [total, noImage, noPrice, noIo, notTranslated, uncategorized, priceChanges] = await Promise.all([
    prisma.product.count({ where: active }),
    prisma.product.count({ where: { ...active, images: { none: {} } } }),
    prisma.product.count({ where: { ...active, ...NO_PRICE_WHERE } }),
    prisma.product.count({ where: { ...active, ioProfile: { is: null } } }),
    prisma.product.count({ where: { ...active, ...NOT_TRANSLATED_WHERE } }),
    countUncategorizedProducts(),
    viewer.seesCosts ? loadPriceChanges(now) : Promise.resolve(null),
  ]);
  const base = "/admin/products?active=yes";
  return {
    active: total,
    counts: [
      { key: "noimg", label: "Sin foto", help: "No tienen ninguna imagen cargada.", count: noImage, href: `${base}&noimg=1` },
      { key: "noprice", label: "Sin precio", help: "Costo en cero o marcados «a consultar»: el cliente ve «Precio a consultar».", count: noPrice, href: `${base}&noprice=1` },
      { key: "noio", label: "Sin ficha de conexiones", help: "Sin entradas/salidas cargadas: Room Builder no los puede cablear.", count: noIo, href: `${base}&noio=1` },
      { key: "notrans", label: "Sin traducir", help: "Tienen descripción del fabricante y nunca se tradujo al español.", count: notTranslated, href: `${base}&notrans=1` },
      { key: "nocat", label: "Sin categorizar", help: "Sin rubro de Tango.", count: uncategorized, href: `${base}&nocat=1` },
    ],
    priceChanges,
  };
}

type StagedPriceRow = { productId: string; name: string; source: string; fromPrice: number | string | null; toPrice: number | string | null; at: Date };

/**
 * Cambios de costo que aplicaron las sincronizaciones de proveedores en la
 * semana. Sale del registro de cada corrida (SyncStagedProduct.diffJson, con
 * el valor anterior y el nuevo de baseCostUsd). Las ediciones a mano y los
 * Excel importados no dejan ese registro, así que no entran.
 */
async function loadPriceChanges(now: Date): Promise<PriceChanges> {
  const since = new Date(now.getTime() - PRICE_WINDOW_DAYS * DAY_MS);
  const runs = await prisma.syncRun.findMany({
    where: { startedAt: { gte: since }, mode: "apply", status: { in: ["COMPLETED", "RUNNING", "APPLYING", "FAILED"] }, priceChanges: { gt: 0 } },
    select: { id: true },
  });
  if (!runs.length) return { ups: 0, downs: 0, avgUpPct: null, avgDownPct: null, biggest: [], runs: 0 };
  const rows = await prisma.$queryRaw<StagedPriceRow[]>`
    SELECT sp."productId", p."normalizedName" AS name, r.source::text AS source, ch->>'from' AS "fromPrice", ch->>'to' AS "toPrice", sp."createdAt" AS at
    FROM "SyncStagedProduct" sp
    JOIN "SyncRun" r ON r.id = sp."syncRunId"
    JOIN "Product" p ON p.id = sp."productId"
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(sp."diffJson"->'changes', '[]'::jsonb)) ch
    WHERE sp."syncRunId" = ANY(${runs.map((r) => r.id)})
      AND sp.status = 'applied'
      AND (sp."diffJson"->>'priceChanged') = 'true'
      AND ch->>'field' = 'baseCostUsd'
  `;
  const changes: PriceChange[] = rows
    .map((r) => ({ productId: r.productId, name: r.name, source: r.source, from: Number(r.fromPrice), to: Number(r.toPrice), at: r.at, pct: 0 }))
    .filter((c) => Number.isFinite(c.from) && Number.isFinite(c.to) && c.from > 0 && c.to > 0 && c.from !== c.to)
    .map((c) => ({ ...c, pct: Math.round(((c.to - c.from) / c.from) * 1000) / 10 }));
  const ups = changes.filter((c) => c.to > c.from);
  const downs = changes.filter((c) => c.to < c.from);
  const avg = (list: PriceChange[]) => (list.length ? Math.round((list.reduce((s, c) => s + c.pct, 0) / list.length) * 10) / 10 : null);
  return {
    ups: ups.length,
    downs: downs.length,
    avgUpPct: avg(ups),
    avgDownPct: avg(downs),
    biggest: [...changes].sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct)).slice(0, 5),
    runs: runs.length,
  };
}
