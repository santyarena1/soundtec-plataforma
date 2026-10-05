"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import { mergeFieldTimestamps } from "@/lib/field-timestamps";
import { buildProductSearchKey } from "@/lib/search-key";
import { HALL_RESEARCH_BRANDS } from "@/services/hall-research/brands";
import {
  parseHallPriceListFile,
  type HallPriceRow,
  type ParsedHallPriceList,
} from "@/services/hall-research/price-list";
import {
  buildHallPriceListPlan,
  physicalData,
  priceChanged,
  type HallCatalogProduct,
} from "@/services/hall-research/price-list-plan";

const DISTRIBUTOR_NAME = "Hall Research";
/** Categorías de la lista que son accesorios (no van como producto principal). */
const ACCESSORY_CATEGORIES = new Set(["cables & adaptors", "parts/spares"]);
/** Clave de sourceMetadata con los datos de la lista; el enriquecimiento web usa otra. */
const RAW_KEY = "hallResearch";
/** Fuente de la foto que trae el Excel; el enriquecimiento la reemplaza por la galería oficial. */
const EXCEL_IMAGE_SOURCE = "hallresearch-excel";
const LAST_IMPORT_KEY = "hall_research.price_list_last_import";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
/** Una lista completa son ~250 altas o cambios en serie: margen amplio dentro del límite de la función. */
const TRANSACTION_TIMEOUT_MS = 180_000;

type Failure = { ok: false; error: string };

export interface HallPreviewMatched {
  productId: string;
  sku: string;
  brand: string;
  oldCost: number;
  newCost: number;
  oldMsrp: number | null;
  newMsrp: number | null;
  changed: boolean;
  isActive: boolean;
}

export interface HallPreviewNew {
  sku: string;
  brand: string;
  category?: string;
  description?: string;
  costUsd: number;
  msrpUsd?: number;
  hasImage: boolean;
}

export interface HallPreviewMissing {
  productId: string;
  sku: string;
  brand: string;
  cost: number;
  isActive: boolean;
}

export interface HallPriceListPreview {
  ok: true;
  fileName: string;
  matched: HallPreviewMatched[];
  toCreate: HallPreviewNew[];
  missing: HallPreviewMissing[];
  invalid: ParsedHallPriceList["invalid"];
  duplicates: string[];
  unknownBrands: string[];
}

async function readUpload(formData: FormData): Promise<{ parsed: ParsedHallPriceList; fileName: string } | Failure> {
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Elegí el Excel de la lista." };
  if (file.size > MAX_FILE_BYTES) return { ok: false, error: "El archivo es demasiado grande (máx. 10 MB)." };
  if (!/\.(xlsx|xls)$/i.test(file.name)) return { ok: false, error: "Tiene que ser un archivo .xlsx o .xls." };
  try {
    const parsed = parseHallPriceListFile(Buffer.from(await file.arrayBuffer()));
    if (parsed.rows.length === 0) return { ok: false, error: "El Excel no tiene filas con SKU, marca y costo." };
    return { parsed, fileName: file.name };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el Excel." };
  }
}

/** Marca de la lista → nombre oficial en el sistema (null si no es del grupo). */
function officialBrand(name: string): string | null {
  return HALL_RESEARCH_BRANDS.find((b) => b.toLowerCase() === name.trim().toLowerCase()) ?? null;
}

async function loadHallProducts(): Promise<HallCatalogProduct[]> {
  const fromSource = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Product" WHERE ("sourceMetadata"->${RAW_KEY}) IS NOT NULL
  `;
  const rows = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: fromSource.map((r) => r.id) } },
        { brand: { name: { in: [...HALL_RESEARCH_BRANDS], mode: "insensitive" } } },
      ],
    },
    orderBy: { supplierSku: "asc" },
    select: {
      id: true,
      supplierSku: true,
      normalizedName: true,
      baseCostUsd: true,
      listPriceUsd: true,
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
    msrpUsd: r.listPriceUsd === null ? null : Number(r.listPriceUsd),
    isActive: r.isActive,
  }));
}

/** Solo filas de las 5 marcas del grupo; el resto se informa y se ignora. */
function splitByBrand(rows: HallPriceRow[]) {
  const known = rows.filter((r) => officialBrand(r.brand));
  const unknownBrands = [...new Set(rows.filter((r) => !officialBrand(r.brand)).map((r) => r.brand))];
  return { known, unknownBrands };
}

export async function previewHallResearchPriceList(formData: FormData): Promise<HallPriceListPreview | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;
  const { known, unknownBrands } = splitByBrand(upload.parsed.rows);
  const plan = buildHallPriceListPlan(known, await loadHallProducts());

  return {
    ok: true,
    fileName: upload.fileName,
    matched: plan.matched.map(({ product, row }) => ({
      productId: product.id,
      sku: product.sku ?? row.sku,
      brand: product.brand,
      oldCost: product.costUsd,
      newCost: row.costUsd,
      oldMsrp: product.msrpUsd,
      newMsrp: row.msrpUsd ?? null,
      changed: priceChanged(product, row),
      isActive: product.isActive,
    })),
    toCreate: plan.toCreate.map((row) => ({
      sku: row.sku,
      brand: officialBrand(row.brand) ?? row.brand,
      category: row.category,
      description: row.shortDescription,
      costUsd: row.costUsd,
      msrpUsd: row.msrpUsd,
      hasImage: !!row.imageUrl,
    })),
    missing: plan.missing.map((p) => ({
      productId: p.id,
      sku: p.sku ?? p.name,
      brand: p.brand,
      cost: p.costUsd,
      isActive: p.isActive,
    })),
    invalid: upload.parsed.invalid,
    duplicates: upload.parsed.duplicates,
    unknownBrands,
  };
}

const decisionsSchema = z.array(
  z.discriminatedUnion("action", [
    z.object({ productId: z.string().min(1), action: z.literal("keep") }),
    z.object({ productId: z.string().min(1), action: z.literal("deactivate") }),
    z.object({ productId: z.string().min(1), action: z.literal("price"), costUsd: z.number().positive().max(1_000_000) }),
  ])
);

export type HallMissingDecision = z.infer<typeof decisionsSchema>[number];

type Tx = Prisma.TransactionClient;
type NamedModel = "brand" | "category" | "distributor";

/**
 * Busca por nombre (sin distinguir mayúsculas) o por slug; si no existe, la crea.
 * Corre dentro de la transacción de la lista, así que si algo falla no queda nada creado.
 */
async function ensureNamed(tx: Tx, model: NamedModel, name: string): Promise<string> {
  const slug = slugify(name);
  const delegate = tx[model] as unknown as typeof tx.brand;
  const find = () =>
    delegate.findFirst({ where: { OR: [{ name: { equals: name, mode: "insensitive" } }, { slug }] }, select: { id: true } });
  const existing = await find();
  if (existing) return existing.id;
  return (await delegate.create({ data: { name, slug }, select: { id: true } })).id;
}

async function ensureIds(tx: Tx, model: NamedModel, names: string[]): Promise<Map<string, string>> {
  const ids = new Map<string, string>();
  for (const name of new Set(names)) ids.set(name.toLowerCase(), await ensureNamed(tx, model, name));
  return ids;
}

/** Datos de la lista que no tienen columna propia: quedan guardados para consulta. */
function rawFromRow(row: HallPriceRow, fileName: string, nowIso: string) {
  return {
    importedAt: nowIso,
    fileName,
    status: row.status,
    replacementSku: row.replacementSku,
    category: row.category,
    certificates: row.certificates,
    upc: row.upc,
    htsEu: row.htsEu,
    htsUs: row.htsUs,
    warranty: row.warranty,
    packageWeightLbs: row.packageWeightLbs,
    webLink: row.webLink,
    imageUrl: row.imageUrl,
  };
}

function createProductData(
  row: HallPriceRow,
  ids: { brandId: string; categoryId?: string; distributorId: string },
  fileName: string,
  nowIso: string
): Prisma.ProductCreateInput {
  const brandName = officialBrand(row.brand) ?? row.brand;
  return {
    // En Soundtec el nombre del producto es su código.
    normalizedName: row.sku,
    originalName: row.shortDescription ?? row.sku,
    supplierSku: row.sku,
    modelNumber: row.sku,
    shortDescription: row.shortDescription,
    longDescription: row.longDescription,
    kind: row.category && ACCESSORY_CATEGORIES.has(row.category.toLowerCase()) ? "ACCESORIO" : "PRINCIPAL",
    baseCostUsd: row.costUsd,
    listPriceUsd: row.msrpUsd,
    currency: "USD",
    coo: row.coo,
    vendorProductUrl: row.webLink,
    ...physicalData(row),
    searchKey: buildProductSearchKey({ supplierSku: row.sku, normalizedName: row.sku, originalName: row.shortDescription, modelNumber: row.sku, brandName }),
    sourceMetadata: { [RAW_KEY]: rawFromRow(row, fileName, nowIso) },
    brand: { connect: { id: ids.brandId } },
    distributor: { connect: { id: ids.distributorId } },
    ...(ids.categoryId ? { category: { connect: { id: ids.categoryId } } } : {}),
    ...(row.imageUrl
      ? { images: { create: [{ url: row.imageUrl, alt: row.sku, source: EXCEL_IMAGE_SOURCE, isPrimary: true }] } }
      : {}),
  };
}

export async function applyHallResearchPriceList(
  formData: FormData
): Promise<{ ok: true; updated: number; created: number; deactivated: number; priced: number; reactivated: number } | Failure> {
  await requireAdmin();
  const upload = await readUpload(formData);
  if ("ok" in upload) return upload;

  let decisions: HallMissingDecision[];
  try {
    decisions = decisionsSchema.parse(JSON.parse(String(formData.get("decisions") ?? "[]")));
  } catch {
    return { ok: false, error: "Las decisiones sobre los productos que quedan afuera no son válidas." };
  }
  const createNew = formData.get("createNew") !== "false";
  const reactivate = formData.get("reactivate") !== "false";

  try {
    const { known } = splitByBrand(upload.parsed.rows);
    const products = await loadHallProducts();
    const plan = buildHallPriceListPlan(known, products);
    const missingIds = new Set(plan.missing.map((p) => p.id));
    const validDecisions = decisions.filter((d) => missingIds.has(d.productId));
    const nowIso = new Date().toISOString();

    const toCreate = createNew ? plan.toCreate : [];
    const touchedIds = [...plan.matched.map((m) => m.product.id), ...validDecisions.map((d) => d.productId)];
    const current = await prisma.product.findMany({
      where: { id: { in: touchedIds } },
      select: { id: true, fieldUpdatedAt: true, sourceMetadata: true },
    });
    const byId = new Map(current.map((c) => [c.id, c]));
    const reactivated = reactivate ? plan.matched.filter((m) => !m.product.isActive).length : 0;

    // Todo o nada: marcas, categorías, precios, altas y bajas en una sola transacción.
    await prisma.$transaction(
      async (tx) => {
        const [brandIds, categoryIds, distributorId] = [
          await ensureIds(tx, "brand", toCreate.map((r) => officialBrand(r.brand) ?? r.brand)),
          await ensureIds(tx, "category", toCreate.map((r) => r.category).filter((c): c is string => !!c)),
          await ensureNamed(tx, "distributor", DISTRIBUTOR_NAME),
        ];

        // Productos que ya existen: SOLO costo, MSRP (y reactivación si volvieron a la lista).
        for (const { product, row } of plan.matched) {
          const changed = ["baseCostUsd", "listPriceUsd", ...(reactivate && !product.isActive ? ["isActive"] : [])];
          const meta = (byId.get(product.id)?.sourceMetadata ?? {}) as Record<string, unknown>;
          await tx.product.update({
            where: { id: product.id },
            data: {
              baseCostUsd: row.costUsd,
              listPriceUsd: row.msrpUsd ?? null,
              ...(reactivate && !product.isActive ? { isActive: true } : {}),
              sourceMetadata: { ...meta, [RAW_KEY]: rawFromRow(row, upload.fileName, nowIso) } as Prisma.InputJsonValue,
              fieldUpdatedAt: mergeFieldTimestamps(byId.get(product.id)?.fieldUpdatedAt, changed, nowIso),
            },
          });
        }

        for (const d of validDecisions) {
          const times = byId.get(d.productId)?.fieldUpdatedAt;
          if (d.action === "deactivate") {
            await tx.product.update({ where: { id: d.productId }, data: { isActive: false, fieldUpdatedAt: mergeFieldTimestamps(times, ["isActive"], nowIso) } });
          } else if (d.action === "price") {
            await tx.product.update({ where: { id: d.productId }, data: { baseCostUsd: d.costUsd, fieldUpdatedAt: mergeFieldTimestamps(times, ["baseCostUsd"], nowIso) } });
          }
        }

        for (const row of toCreate) {
          await tx.product.create({
            data: createProductData(
              row,
              {
                brandId: brandIds.get((officialBrand(row.brand) ?? row.brand).toLowerCase())!,
                categoryId: row.category ? categoryIds.get(row.category.toLowerCase()) : undefined,
                distributorId,
              },
              upload.fileName,
              nowIso
            ),
            select: { id: true },
          });
        }
      },
      { maxWait: 10_000, timeout: TRANSACTION_TIMEOUT_MS }
    );

    const deactivated = validDecisions.filter((d) => d.action === "deactivate").length;
    const priced = validDecisions.filter((d) => d.action === "price").length;
    await setSetting(
      LAST_IMPORT_KEY,
      JSON.stringify({
        at: nowIso,
        fileName: upload.fileName,
        updated: plan.matched.length,
        created: toCreate.length,
        deactivated,
        priced,
        reactivated,
      }),
      { description: "Última lista de precios de Hall Research aplicada." }
    );

    revalidatePath("/admin/products");
    revalidatePath("/admin/brands");
    revalidatePath("/catalogo");
    revalidatePath("/portal/products");
    return { ok: true, updated: plan.matched.length, created: toCreate.length, deactivated, priced, reactivated };
  } catch (error) {
    console.error("[hall-research-price-list] apply failed", error);
    return { ok: false, error: "No se pudo aplicar la lista y no se cambió nada. Probá de nuevo." };
  }
}
