/**
 * Plan y aplicación del llenado de series (ProductLine) desde los datos que ya
 * trae cada producto. Idempotente: no pisa una serie ya asignada (manual o de
 * una corrida anterior) y reusa las series existentes por (marca, slug).
 */
import type { PrismaClient, ProductLineSource } from "@prisma/client";
import { cleanRawProductLine, detectProductSeries, seriesSlug, type ProductLineSourceKey } from "@/lib/product-lines/detect";

export type SeriesPlanBrand = {
  brandId: string;
  brand: string;
  products: number;
  withSeries: number;
  alreadyAssigned: number;
  series: Array<{ name: string; slug: string; source: ProductLineSourceKey; count: number; exists: boolean; sample: string[] }>;
  ambiguous: Array<{ model: string; candidates: string[] }>;
  withoutSeries: number;
  withoutSeriesSample: string[];
};

export type SeriesPlan = {
  brands: SeriesPlanBrand[];
  assignments: Array<{ productId: string; brandId: string; slug: string }>;
  newSeries: Array<{ brandId: string; name: string; slug: string; source: ProductLineSourceKey }>;
  productLineCleanup: Array<{ productId: string; model: string; before: string; after: string | null }>;
};

const SAMPLE = 8;

async function hasProductLineSchema(prisma: PrismaClient): Promise<boolean> {
  const r = await prisma.$queryRaw<Array<{ n: bigint }>>`SELECT count(*)::bigint AS n FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = ${"ProductLine"}`;
  return Number(r[0]?.n ?? 0) > 0;
}

export async function planProductLines(prisma: PrismaClient): Promise<SeriesPlan> {
  // Base sin la tabla todavía (producción antes del deploy): el dry-run igual funciona, como si no hubiera series.
  const schemaReady = await hasProductLineSchema(prisma);
  const [rows, existing] = await Promise.all([
    prisma.product.findMany({
      where: { isActive: true, brandId: { not: null } },
      select: {
        id: true,
        modelNumber: true,
        supplierSku: true,
        line: true,
        ...(schemaReady ? { lineId: true, lineLocked: true } : {}),
        productLine: true,
        sourceCategoryPath: true,
        sourceMetadata: true,
        brandId: true,
        brand: { select: { name: true } },
      },
    }),
    schemaReady ? prisma.productLine.findMany({ select: { id: true, brandId: true, slug: true } }) : Promise.resolve([]),
  ]);
  const products = rows.map((r) => {
    const x = r as { lineId?: string | null; lineLocked?: boolean };
    return { ...r, lineId: x.lineId ?? null, lineLocked: x.lineLocked ?? false };
  });
  const existingKey = new Set(existing.map((s) => `${s.brandId}|${s.slug}`));

  const byBrand = new Map<string, SeriesPlanBrand>();
  const seriesAcc = new Map<string, SeriesPlanBrand["series"][number]>();
  const assignments: SeriesPlan["assignments"] = [];
  const newSeries = new Map<string, SeriesPlan["newSeries"][number]>();
  const productLineCleanup: SeriesPlan["productLineCleanup"] = [];

  for (const p of products) {
    const brandId = p.brandId!;
    const model = p.modelNumber || p.supplierSku || p.id;
    const b =
      byBrand.get(brandId) ??
      ({ brandId, brand: p.brand?.name ?? "?", products: 0, withSeries: 0, alreadyAssigned: 0, series: [], ambiguous: [], withoutSeries: 0, withoutSeriesSample: [] } as SeriesPlanBrand);
    byBrand.set(brandId, b);
    b.products += 1;

    const cleaned = cleanRawProductLine(p.productLine);
    // El nombre que trae ese JSON es una promo o el nombre del producto, no una línea: se borra.
    if (cleaned !== null) productLineCleanup.push({ productId: p.id, model, before: p.productLine!, after: null });

    if (p.lineId) {
      b.alreadyAssigned += 1;
      b.withSeries += 1;
      continue;
    }
    // Alguien le sacó la serie a mano: no se vuelve a asignar.
    if (p.lineLocked) {
      b.withoutSeries += 1;
      continue;
    }
    const d = detectProductSeries({
      brandName: p.brand?.name ?? null,
      modelNumber: p.modelNumber,
      supplierSku: p.supplierSku,
      line: p.line,
      sourceCategoryPath: p.sourceCategoryPath,
      sourceMetadata: p.sourceMetadata,
    });
    if (d.kind === "series") {
      const slug = seriesSlug(d.name);
      const k = `${brandId}|${slug}`;
      let s = seriesAcc.get(k);
      if (!s) {
        s = { name: d.name, slug, source: d.source, count: 0, exists: existingKey.has(k), sample: [] };
        seriesAcc.set(k, s);
        b.series.push(s);
        if (!s.exists) newSeries.set(k, { brandId, name: d.name, slug, source: d.source });
      }
      s.count += 1;
      if (s.sample.length < SAMPLE) s.sample.push(model);
      b.withSeries += 1;
      assignments.push({ productId: p.id, brandId, slug });
    } else {
      b.withoutSeries += 1;
      if (d.kind === "ambiguous") b.ambiguous.push({ model, candidates: d.candidates });
      else if (b.withoutSeriesSample.length < 30) b.withoutSeriesSample.push(model);
    }
  }

  const brands = [...byBrand.values()]
    .map((b) => ({ ...b, series: [...b.series].sort((x, y) => y.count - x.count) }))
    .sort((x, y) => y.withSeries - x.withSeries || x.brand.localeCompare(y.brand));
  return { brands, assignments, newSeries: [...newSeries.values()], productLineCleanup };
}

export type SeriesApplyResult = { seriesCreated: number; productsAssigned: number; productLineCleaned: number };

export async function applyProductLines(prisma: PrismaClient, plan: SeriesPlan): Promise<SeriesApplyResult> {
  let seriesCreated = 0;
  for (const s of plan.newSeries) {
    const found = await prisma.productLine.findUnique({ where: { brandId_slug: { brandId: s.brandId, slug: s.slug } } });
    if (found) continue;
    await prisma.productLine.create({ data: { brandId: s.brandId, name: s.name, slug: s.slug, source: s.source as ProductLineSource } });
    seriesCreated += 1;
  }
  const series = await prisma.productLine.findMany({ select: { id: true, brandId: true, slug: true } });
  const idByKey = new Map(series.map((s) => [`${s.brandId}|${s.slug}`, s.id]));

  const grouped = new Map<string, string[]>();
  for (const a of plan.assignments) {
    const id = idByKey.get(`${a.brandId}|${a.slug}`);
    if (!id) continue;
    grouped.set(id, [...(grouped.get(id) ?? []), a.productId]);
  }
  let productsAssigned = 0;
  for (const [lineId, ids] of grouped) {
    for (let i = 0; i < ids.length; i += 500) {
      // lineId: null → nunca pisa una serie ya asignada (idempotente y respeta lo manual).
      const r = await prisma.product.updateMany({ where: { id: { in: ids.slice(i, i + 500) }, lineId: null, lineLocked: false }, data: { lineId } });
      productsAssigned += r.count;
    }
  }

  let productLineCleaned = 0;
  for (const c of plan.productLineCleanup) {
    const r = await prisma.product.updateMany({ where: { id: c.productId, productLine: c.before }, data: { productLine: c.after } });
    productLineCleaned += r.count;
  }
  return { seriesCreated, productsAssigned, productLineCleaned };
}
