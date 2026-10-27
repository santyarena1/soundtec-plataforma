/**
 * Aplicar una lista de precios de SoundTube (costo + MUP, clasificación
 * opcional y decisiones sobre los productos que quedan afuera). Lo usan la
 * pantalla de la lista y el módulo de revisión. Sin "use server": no es una
 * acción pública; quien lo llama ya validó permisos.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isTangoTreeActive } from "@/lib/tango-tree-db";
import { getSetting, setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { mergeFieldTimestamps } from "@/lib/field-timestamps";
import { autoPriority, markupToMarginPercent } from "@/lib/pricing-scope";
import { SOUNDTUBE_MUP_GROUP_ID, SOUNDTUBE_SETTING_KEYS } from "@/services/sync/connectors/soundtube";
import { skuKey, type PriceListRow } from "@/services/soundtube/price-list";
import { buildPriceListPlan, type CatalogProduct, type SkuAliases } from "@/services/soundtube/price-list-plan";

/** Marcas que entran por SoundTube (ver services/sync/connectors/soundtube.ts). */
export const SOUNDTUBE_BRANDS = [
  "SoundTube",
  "Soundsphere",
  "Phase Technology",
  "dARTS",
  "Rockustics",
  "Induction Dynamics",
  "SolidDrive",
];
/** Todas las reglas de MUP creadas por la lista comparten este groupId; cada subida las reemplaza. */
const MUP_GROUP_ID = SOUNDTUBE_MUP_GROUP_ID;
export const LAST_IMPORT_KEY = "soundtube.price_list_last_import";
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const SKU_ALIASES_KEY = "soundtube.sku_aliases";

/** Equivalencias de SKU confirmadas por el usuario (SKU del Excel → producto). */
export async function loadSkuAliases(): Promise<Map<string, string>> {
  try {
    const raw = JSON.parse(await getSetting(SKU_ALIASES_KEY, "{}")) as Record<string, unknown>;
    return new Map(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
  } catch {
    return new Map();
  }
}

/** Suma equivalencias (las nuevas pisan a las viejas del mismo SKU). */
export async function addSkuAliases(entries: Array<{ excelSku: string; productId: string }>): Promise<void> {
  if (entries.length === 0) return;
  const current = await loadSkuAliases();
  for (const e of entries) current.set(skuKey(e.excelSku), e.productId);
  await setSetting(SKU_ALIASES_KEY, JSON.stringify(Object.fromEntries(current)), {
    description: "Equivalencias de SKU de la lista SoundTube confirmadas en la revisión.",
  });
}

const isMerged = (meta: unknown) => Boolean(meta && typeof meta === "object" && "mergedInto" in (meta as Record<string, unknown>));

const MANUAL_PRICES_KEY = "soundtube.manual_prices";

/** Precios cargados a mano en Revisión SoundTube (productos que no están en la lista). */
export async function loadManualPrices(): Promise<Map<string, { costUsd: number; mup: number }>> {
  try {
    const raw = JSON.parse(await getSetting(MANUAL_PRICES_KEY, "{}")) as Record<string, { costUsd: number; mup: number }>;
    return new Map(Object.entries(raw).filter(([, v]) => v && Number(v.costUsd) > 0 && Number(v.mup) > 0));
  } catch {
    return new Map();
  }
}

async function saveManualPrices(map: Map<string, { costUsd: number; mup: number }>): Promise<void> {
  await setSetting(MANUAL_PRICES_KEY, JSON.stringify(Object.fromEntries(map)), {
    description: "Precios de SoundTube cargados a mano (productos que no vienen en la lista Excel).",
  });
}

/** Carga a mano el costo y el MUP de un producto que no viene en la lista. */
export async function setManualPrice(productId: string, costUsd: number, mup: number): Promise<void> {
  const product = await prisma.product.findUnique({ where: { id: productId }, select: { supplierSku: true, normalizedName: true, fieldUpdatedAt: true } });
  if (!product) throw new Error("El producto no existe.");
  const nowIso = new Date().toISOString();
  await prisma.$transaction([
    prisma.product.update({
      where: { id: productId },
      data: { baseCostUsd: costUsd, requiresQuote: false, fieldUpdatedAt: mergeFieldTimestamps(product.fieldUpdatedAt, ["baseCostUsd"], nowIso) },
    }),
    prisma.marginRule.deleteMany({ where: { groupId: MUP_GROUP_ID, productId } }),
    prisma.marginRule.create({ data: { ...mupRule(productId, product.supplierSku ?? product.normalizedName, mup), notes: "Precio cargado a mano en Revisión SoundTube (no está en la lista)." } }),
  ]);
  const manual = await loadManualPrices();
  manual.set(productId, { costUsd, mup });
  await saveManualPrices(manual);
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
}

/** Productos de SoundTube activos sin precio (los que trajo el portal y no están en la lista). */
export async function listUnpricedProducts(): Promise<Array<{ id: string; sku: string; title: string; brand: string; hasImage: boolean }>> {
  const products = (await loadSoundTubeProducts()).filter((p) => p.isActive);
  const priced = new Set(
    (await prisma.marginRule.findMany({ where: { groupId: MUP_GROUP_ID }, select: { productId: true } })).flatMap((r) => (r.productId ? [r.productId] : []))
  );
  const candidates = products.filter((p) => !priced.has(p.id) || p.costUsd <= 0).map((p) => p.id);
  if (!candidates.length) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: candidates } },
    select: { id: true, supplierSku: true, normalizedName: true, originalName: true, brand: { select: { name: true } }, images: { select: { id: true }, take: 1 } },
    orderBy: { normalizedName: "asc" },
  });
  return rows.map((r) => ({ id: r.id, sku: r.supplierSku ?? r.normalizedName, title: r.originalName || r.normalizedName, brand: r.brand?.name ?? "—", hasImage: r.images.length > 0 }));
}

export async function loadSoundTubeProducts(): Promise<CatalogProduct[]> {
  const fromSource = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Product" WHERE ("sourceMetadata"->'soundtube') IS NOT NULL
  `;
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: fromSource.map((r) => r.id) } },
        { brand: { name: { in: SOUNDTUBE_BRANDS, mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      supplierSku: true,
      normalizedName: true,
      originalName: true,
      baseCostUsd: true,
      isActive: true,
      sourceMetadata: true,
      brand: { select: { name: true } },
    },
  });
  // Los unidos a otro (duplicados resueltos) no cuentan: la lista actualiza al que quedó visible.
  return rows.filter((r) => !isMerged(r.sourceMetadata)).map((r) => ({
    id: r.id,
    sku: r.supplierSku,
    name: r.normalizedName,
    title: r.originalName || undefined,
    brand: r.brand?.name ?? "—",
    costUsd: Number(r.baseCostUsd),
    isActive: r.isActive,
  }));
}

export const decisionsSchema = z.array(
  z.discriminatedUnion("action", [
    z.object({ productId: z.string().min(1), action: z.literal("keep") }),
    z.object({ productId: z.string().min(1), action: z.literal("deactivate") }),
    z.object({
      productId: z.string().min(1),
      action: z.literal("price"),
      costUsd: z.number().positive().max(1_000_000),
      mup: z.number().positive().max(20),
    }),
  ])
);

export type MissingDecision = z.infer<typeof decisionsSchema>[number];

async function taxonomyIds(
  model: "category" | "productFamily",
  names: Array<string | undefined>
): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const raw of new Set(names.filter((n): n is string => !!n?.trim()).map((n) => n.trim()))) {
    const delegate = model === "category" ? prisma.category : prisma.productFamily;
    const existing = await (delegate as typeof prisma.category).findFirst({
      where: { name: { equals: raw, mode: "insensitive" } },
      select: { id: true },
    });
    const id =
      existing?.id ??
      (await (delegate as typeof prisma.category).create({
        data: { name: raw, slug: slugify(raw) },
        select: { id: true },
      })).id;
    ids.set(raw.toLowerCase(), id);
  }
  return ids;
}

function mupRule(productId: string, sku: string, mup: number) {
  return {
    name: `SoundTube lista · ${sku} · markup ×${mup}`,
    priority: autoPriority("PRODUCT", false),
    scopeType: "PRODUCT" as const,
    scopeId: productId,
    productId,
    marginPercent: Math.min(999.999, markupToMarginPercent(mup)),
    markupMultiplier: mup,
    groupId: MUP_GROUP_ID,
    notes: "Creada por la lista Excel de SoundTube. Se reemplaza en cada subida.",
  };
}

export interface ApplySoundTubeInput {
  rows: PriceListRow[];
  fileName: string;
  decisions: MissingDecision[];
  applyTaxonomy: boolean;
  aliases?: SkuAliases;
}

export type ApplySoundTubeResult =
  | { ok: true; updated: number; deactivated: number; priced: number }
  | { ok: false; error: string };

export async function applySoundTubeRows(input: ApplySoundTubeInput): Promise<ApplySoundTubeResult> {
  const { decisions, applyTaxonomy } = input;
  try {
    const products = await loadSoundTubeProducts();
    const plan = buildPriceListPlan(input.rows, products, input.aliases ?? (await loadSkuAliases()));
    const missingIds = new Set(plan.missing.map((p) => p.id));
    const validDecisions = decisions.filter((d) => missingIds.has(d.productId));
    const skuById = new Map(products.map((p) => [p.id, p.sku ?? p.name]));

    // Con el árbol de Tango cargado, la lista no pisa el rubro (el segmento sí, va a familia).
    const tangoActive = await isTangoTreeActive(prisma);
    const [categoryIds, familyIds] = applyTaxonomy
      ? await Promise.all([
          tangoActive ? new Map<string, string>() : taxonomyIds("category", plan.matched.map((m) => m.row.categoria)),
          taxonomyIds("productFamily", plan.matched.map((m) => m.row.segmento)),
        ])
      : [new Map<string, string>(), new Map<string, string>()];

    const timestamps = await prisma.product.findMany({
      where: { id: { in: [...plan.matched.map((m) => m.product.id), ...validDecisions.map((d) => d.productId)] } },
      select: { id: true, fieldUpdatedAt: true },
    });
    const fieldTimes = new Map(timestamps.map((t) => [t.id, t.fieldUpdatedAt]));
    const nowIso = new Date().toISOString();

    // Única fuente de precio: SPRDIS US de la lista. Lo que no viene en la lista queda SIN precio,
    // salvo que se le haya cargado un precio a mano en Revisión SoundTube (se conserva entre listas).
    const repriced = new Set(validDecisions.filter((d) => d.action === "price").map((d) => d.productId));
    const manual = await loadManualPrices();
    for (const { product } of plan.matched) manual.delete(product.id); // la lista manda
    const keptManual = [...missingIds].filter((id) => !repriced.has(id) && manual.has(id));
    const previouslyPriced = new Set(keptManual);
    const previousRules = keptManual.map((id) => ({ productId: id, markupMultiplier: manual.get(id)!.mup }));
    for (const d of validDecisions) if (d.action === "price") manual.set(d.productId, { costUsd: d.costUsd, mup: d.mup });

    const productUpdates = [
      ...plan.matched.map(({ product, row }) => {
        const taxonomy = applyTaxonomy
          ? {
              categoryId: row.categoria ? categoryIds.get(row.categoria.toLowerCase()) : undefined,
              familyId: row.segmento ? familyIds.get(row.segmento.toLowerCase()) : undefined,
              familia: row.familia,
              tipo: row.tipo,
            }
          : {};
        const changed = ["baseCostUsd", ...Object.keys(taxonomy).filter((k) => taxonomy[k as keyof typeof taxonomy])];
        return prisma.product.update({
          where: { id: product.id },
          data: {
            baseCostUsd: row.costUsd,
            requiresQuote: false,
            currency: "USD",
            ...taxonomy,
            fieldUpdatedAt: mergeFieldTimestamps(fieldTimes.get(product.id), changed, nowIso),
          },
        });
      }),
      ...validDecisions.flatMap((d) => {
        if (d.action === "deactivate") {
          return [prisma.product.update({
            where: { id: d.productId },
            data: { isActive: false, fieldUpdatedAt: mergeFieldTimestamps(fieldTimes.get(d.productId), ["isActive"], nowIso) },
          })];
        }
        if (d.action === "price") {
          return [prisma.product.update({
            where: { id: d.productId },
            data: { baseCostUsd: d.costUsd, requiresQuote: false, fieldUpdatedAt: mergeFieldTimestamps(fieldTimes.get(d.productId), ["baseCostUsd"], nowIso) },
          })];
        }
        return [];
      }),
      // Los que no están en esta lista y nunca tuvieron precio de una lista (ni cargado a mano)
      // quedan SIN precio (costo 0, "a consultar"): son los que trajo el portal.
      ...(() => {
        const handled = new Set(validDecisions.filter((d) => d.action !== "keep").map((d) => d.productId));
        const unpriced = [...missingIds].filter((id) => !handled.has(id) && !previouslyPriced.has(id));
        return unpriced.length
          ? [prisma.product.updateMany({ where: { id: { in: unpriced } }, data: { baseCostUsd: 0, requiresQuote: true } })]
          : [];
      })(),
    ];

    const rules = [
      ...plan.matched.map(({ product, row }) => mupRule(product.id, product.sku ?? row.sku, row.mup)),
      ...validDecisions.flatMap((d) =>
        d.action === "price" ? [mupRule(d.productId, skuById.get(d.productId) ?? d.productId, d.mup)] : []
      ),
      ...previousRules.flatMap((r) =>
        r.productId && r.markupMultiplier
          ? [mupRule(r.productId, skuById.get(r.productId) ?? r.productId, Number(r.markupMultiplier))]
          : []
      ),
    ];

    // Todo o nada: costos, bajas y reglas de MUP en una sola transacción.
    await prisma.$transaction(
      [
        ...productUpdates,
        prisma.marginRule.deleteMany({ where: { groupId: MUP_GROUP_ID } }),
        prisma.marginRule.createMany({ data: rules }),
      ]
    );

    const deactivated = validDecisions.filter((d) => d.action === "deactivate").length;
    const priced = validDecisions.filter((d) => d.action === "price").length;
    await Promise.all([
      setSetting(SOUNDTUBE_SETTING_KEYS.priceSource, "excel", {
        description: "El costo de SoundTube sale de la lista Excel, no del sync.",
      }),
      applyTaxonomy
        ? setSetting(SOUNDTUBE_SETTING_KEYS.taxonomySource, "excel", {
            description: "La clasificación de SoundTube sale de la lista Excel, no del sync.",
          })
        : Promise.resolve(),
      setSetting(
        LAST_IMPORT_KEY,
        JSON.stringify({
          at: nowIso,
          fileName: input.fileName,
          updated: plan.matched.length,
          notInSystem: plan.notInSystem.length,
          deactivated,
          priced,
          applyTaxonomy,
        })
      ),
    ]);

    await saveManualPrices(manual);
    revalidatePath("/admin/products");
    revalidatePath("/admin/margins");
    return { ok: true, updated: plan.matched.length, deactivated, priced };
  } catch (error) {
    console.error("[soundtube-price-list] apply failed", error);
    return { ok: false, error: "No se pudo aplicar la lista y no se cambió nada. Probá de nuevo." };
  }
}

/**
 * Deja sin precio (costo 0, "a consultar") los productos de SoundTube que no
 * tienen precio de la lista Excel (ni uno cargado a mano en la revisión): son
 * los que trajo el portal. Lo mismo hace el sync en cada corrida; esto lo
 * aplica ya. Devuelve cuántos productos cambió.
 */
export async function clearPortalPrices(): Promise<number> {
  const products = await loadSoundTubeProducts();
  const priced = new Set(
    (
      await prisma.marginRule.findMany({ where: { groupId: MUP_GROUP_ID }, select: { productId: true } })
    ).flatMap((r) => (r.productId ? [r.productId] : []))
  );
  const ids = products.filter((p) => !priced.has(p.id)).map((p) => p.id);
  if (!ids.length) return 0;
  const result = await prisma.product.updateMany({
    where: { id: { in: ids }, OR: [{ baseCostUsd: { not: 0 } }, { requiresQuote: false }] },
    data: { baseCostUsd: 0, requiresQuote: true },
  });
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
  return result.count;
}
