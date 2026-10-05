"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { mergeFieldTimestamps } from "@/lib/field-timestamps";
import { autoPriority, markupToMarginPercent } from "@/lib/pricing-scope";
import { SOUNDTUBE_SETTING_KEYS } from "@/services/sync/connectors/soundtube";
import { parsePriceListFile, type ParsedPriceList, type PriceListRow } from "@/services/soundtube/price-list";
import { buildPriceListPlan, type CatalogProduct } from "@/services/soundtube/price-list-plan";

/** Marcas que entran por SoundTube (ver services/sync/connectors/soundtube.ts). */
const SOUNDTUBE_BRANDS = [
  "SoundTube",
  "Soundsphere",
  "Phase Technology",
  "dARTS",
  "Rockustics",
  "Induction Dynamics",
  "SolidDrive",
];
/** Todas las reglas de MUP creadas por la lista comparten este groupId; cada subida las reemplaza. */
const MUP_GROUP_ID = "soundtube-excel-mup";
const LAST_IMPORT_KEY = "soundtube.price_list_last_import";
const MAX_FILE_BYTES = 10 * 1024 * 1024;

export interface PreviewMatched {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  excelRow: number;
  oldCost: number;
  newCost: number;
  mup: number;
  isActive: boolean;
  /** SKU como viene en el Excel cuando difiere solo en espacios o guiones. */
  excelSku?: string;
  categoria?: string;
  segmento?: string;
  familia?: string;
  tipo?: string;
}

export interface PreviewMissing {
  productId: string;
  sku: string;
  name: string;
  brand: string;
  cost: number;
  isActive: boolean;
}

export interface PriceListPreview {
  ok: true;
  fileName: string;
  matched: PreviewMatched[];
  notInSystem: PriceListRow[];
  missing: PreviewMissing[];
  warnings: ParsedPriceList["warnings"];
  invalid: ParsedPriceList["invalid"];
}

type Failure = { ok: false; error: string };

async function readUpload(formData: FormData): Promise<{ parsed: ParsedPriceList; fileName: string } | Failure> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí el Excel de la lista." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo es demasiado grande (máx. 10 MB)." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { ok: false, error: "Tiene que ser un archivo .xlsx o .xls." };
  try {
    const parsed = parsePriceListFile(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0) return { ok: false, error: "El Excel no tiene filas con costo y MUP." };
    return { parsed, fileName: file.name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el Excel." };
  }
}

async function loadSoundTubeProducts(): Promise<CatalogProduct[]> {
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
      baseCostUsd: true,
      isActive: true,
      brand: { select: { name: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    sku: r.supplierSku,
    name: r.normalizedName,
    brand: r.brand?.name ?? "—",
    costUsd: Number(r.baseCostUsd),
    isActive: r.isActive,
  }));
}

export async function previewSoundTubePriceList(formData: FormData): Promise<PriceListPreview | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;
  const plan = buildPriceListPlan(upload.parsed.rows, await loadSoundTubeProducts());

  return {
    ok: true,
    fileName: upload.fileName,
    matched: plan.matched.map(({ product, row, looseMatch }) => ({
      productId: product.id,
      sku: product.sku ?? row.sku,
      name: product.name,
      brand: product.brand,
      excelRow: row.excelRow,
      oldCost: product.costUsd,
      newCost: row.costUsd,
      mup: row.mup,
      isActive: product.isActive,
      excelSku: looseMatch ? row.sku : undefined,
      categoria: row.categoria,
      segmento: row.segmento,
      familia: row.familia,
      tipo: row.tipo,
    })),
    notInSystem: plan.notInSystem,
    missing: plan.missing.map((p) => ({
      productId: p.id,
      sku: p.sku ?? "",
      name: p.name,
      brand: p.brand,
      cost: p.costUsd,
      isActive: p.isActive,
    })),
    warnings: upload.parsed.warnings,
    invalid: upload.parsed.invalid,
  };
}

const decisionsSchema = z.array(
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

export async function applySoundTubePriceList(
  formData: FormData
): Promise<{ ok: true; updated: number; deactivated: number; priced: number } | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;

  let decisions: MissingDecision[];
  try {
    decisions = decisionsSchema.parse(JSON.parse(String(formData.get("decisions") ?? "[]")));
  } catch {
    return { ok: false, error: "Las decisiones sobre los productos que quedan afuera no son válidas." };
  }
  const applyTaxonomy = formData.get("applyTaxonomy") === "true";

  try {
    const products = await loadSoundTubeProducts();
    const plan = buildPriceListPlan(upload.parsed.rows, products);
    const missingIds = new Set(plan.missing.map((p) => p.id));
    const validDecisions = decisions.filter((d) => missingIds.has(d.productId));
    const skuById = new Map(products.map((p) => [p.id, p.sku ?? p.name]));

    const [categoryIds, familyIds] = applyTaxonomy
      ? await Promise.all([
          taxonomyIds("category", plan.matched.map((m) => m.row.categoria)),
          taxonomyIds("productFamily", plan.matched.map((m) => m.row.segmento)),
        ])
      : [new Map<string, string>(), new Map<string, string>()];

    const timestamps = await prisma.product.findMany({
      where: { id: { in: [...plan.matched.map((m) => m.product.id), ...validDecisions.map((d) => d.productId)] } },
      select: { id: true, fieldUpdatedAt: true },
    });
    const fieldTimes = new Map(timestamps.map((t) => [t.id, t.fieldUpdatedAt]));
    const nowIso = new Date().toISOString();

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
            data: { baseCostUsd: d.costUsd, fieldUpdatedAt: mergeFieldTimestamps(fieldTimes.get(d.productId), ["baseCostUsd"], nowIso) },
          })];
        }
        return [];
      }),
    ];

    // Los que quedan afuera sin precio nuevo conservan el MUP de la lista anterior.
    const repriced = new Set(validDecisions.filter((d) => d.action === "price").map((d) => d.productId));
    const previousRules = await prisma.marginRule.findMany({
      where: { groupId: MUP_GROUP_ID, productId: { in: [...missingIds].filter((id) => !repriced.has(id)) } },
      select: { productId: true, markupMultiplier: true },
    });
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
          fileName: upload.fileName,
          updated: plan.matched.length,
          notInSystem: plan.notInSystem.length,
          deactivated,
          priced,
          applyTaxonomy,
        })
      ),
    ]);

    revalidatePath("/admin/products");
    revalidatePath("/admin/margins");
    return { ok: true, updated: plan.matched.length, deactivated, priced };
  } catch (error) {
    console.error("[soundtube-price-list] apply failed", error);
    return { ok: false, error: "No se pudo aplicar la lista y no se cambió nada. Probá de nuevo." };
  }
}
