"use server";

/**
 * Edición rápida desde la ficha del portal (lápiz flotante, solo equipo con
 * permiso de editar productos). Reusa las acciones del admin: textos y
 * clasificación pasan por `upsertProduct` (rubro con revisión de precios),
 * fotos por la galería del admin, etiquetas y accesorios por sus paneles.
 * Lo único propio es el contenido enriquecido (características,
 * especificaciones y documentos), que el admin no tenía cómo editar.
 */
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { listCategoryTree, type CategoryNode } from "@/lib/category-tree";
import { GALLERY_IMAGE_ORDER, GALLERY_VIDEO_ORDER, mergeGalleryMedia } from "@/lib/product-media";
import { mergeFieldTimestamps } from "@/lib/field-timestamps";
import { cleanDocs, cleanFeatures, cleanSpecs, docsFromJson, featuresFromJson, specsFromJson, type DocRow, type SpecRow } from "@/lib/quick-edit/content";
import type { QuickEditAccess } from "@/lib/quick-edit/access";
import type { GalleryEditorItem } from "@/app/admin/products/[id]/gallery-editor";
import type { RelationItem } from "@/app/admin/products/[id]/accessories-panel";
import { refreshProductViews, requireQuickEdit, saveProductPatch, type QuickEditResult } from "@/server/quick-edit/shared";

export interface QuickEditData {
  access: QuickEditAccess;
  product: {
    id: string;
    name: string;
    internalSku: string | null;
    supplierSku: string | null;
    modelNumber: string | null;
    shortDescription: string;
    longDescription: string;
    aiGenerated: boolean;
    keyFeatures: string[];
    featuresInSpanish: boolean;
    specifications: SpecRow[];
    documents: DocRow[];
    brandId: string | null;
    categoryId: string | null;
    lineId: string | null;
    labelIds: string[];
    commercialTag: string | null;
    isFeatured: boolean;
    isActive: boolean;
    isDiscontinued: boolean;
    stockStatus: string;
    stockQuantity: number | null;
    kind: "PRINCIPAL" | "ACCESORIO";
    updatedAt: string;
  };
  media: GalleryEditorItem[];
  relations: RelationItem[];
  brands: Array<{ id: string; name: string }>;
  series: Array<{ id: string; name: string; brandId: string }>;
  labels: Array<{ id: string; name: string; color: string }>;
  categories: CategoryNode[];
}

const idSchema = z.string().min(1).max(64);

export async function loadQuickEdit(productId: string): Promise<{ ok: true; data: QuickEditData } | { ok: false; error: string }> {
  const { access } = await requireQuickEdit();
  const id = idSchema.safeParse(productId);
  if (!id.success) return { ok: false, error: "Producto inválido." };
  const product = await prisma.product.findUnique({
    where: { id: id.data },
    include: {
      images: { orderBy: GALLERY_IMAGE_ORDER },
      videos: { orderBy: GALLERY_VIDEO_ORDER },
      labels: { select: { labelId: true } },
      accessories: {
        where: { kind: { in: ["ACCESSORY", "INCLUDED"] } },
        include: { accessoryProduct: { select: { id: true, normalizedName: true, internalSku: true, kind: true } } },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!product) return { ok: false, error: "El producto no existe." };
  const [brands, series, labels, categories] = await Promise.all([
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.productLine.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, brandId: true } }),
    prisma.label.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, color: true } }),
    listCategoryTree(),
  ]);
  const sources = new Map(product.images.map((i) => [i.id, i.source]));
  return {
    ok: true,
    data: {
      access,
      product: {
        id: product.id,
        name: product.normalizedName,
        internalSku: product.internalSku,
        supplierSku: product.supplierSku,
        modelNumber: product.modelNumber,
        shortDescription: product.shortDescription ?? "",
        longDescription: product.longDescription ?? "",
        aiGenerated: product.aiGeneratedDescription,
        keyFeatures: featuresFromJson(product.keyFeatures),
        featuresInSpanish: product.translatedAt != null,
        specifications: specsFromJson(product.specifications),
        documents: docsFromJson(product.documents),
        brandId: product.brandId,
        categoryId: product.categoryId,
        lineId: product.lineId,
        labelIds: product.labels.map((l) => l.labelId),
        commercialTag: product.commercialTag,
        isFeatured: product.isFeatured,
        isActive: product.isActive,
        isDiscontinued: product.isDiscontinued,
        stockStatus: product.stockStatus,
        stockQuantity: product.stockQuantity,
        kind: product.kind,
        updatedAt: product.updatedAt.toISOString(),
      },
      media: mergeGalleryMedia(product.images, product.videos).map((item) => ({
        ...item,
        createdAt: new Date(item.createdAt).toISOString(),
        source: item.kind === "image" ? sources.get(item.id) ?? null : null,
      })),
      relations: product.accessories.map((r) => ({
        id: r.id,
        kind: r.kind as RelationItem["kind"],
        isRequired: r.isRequired,
        quantity: r.quantity,
        accessoryProduct: r.accessoryProduct,
      })),
      brands,
      series,
      labels,
      categories,
    },
  };
}

const textsSchema = z.object({
  productId: idSchema,
  name: z.string().trim().min(2, "El nombre necesita al menos 2 caracteres.").max(280, "El nombre: máximo 280 caracteres."),
  shortDescription: z.string().max(500, "La descripción corta: máximo 500 caracteres."),
  longDescription: z.string().max(20000, "La descripción larga: máximo 20.000 caracteres."),
});

/** Nombre visible y descripciones (con la acción de la ficha del admin). */
export async function saveQuickEditTexts(input: z.input<typeof textsSchema>): Promise<QuickEditResult> {
  await requireQuickEdit();
  const parsed = textsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  return saveProductPatch(parsed.data.productId, {
    normalizedName: parsed.data.name,
    shortDescription: parsed.data.shortDescription.trim() || null,
    longDescription: parsed.data.longDescription.trim() || null,
  });
}

type JsonField = "keyFeatures" | "specifications" | "documents";

async function saveJsonFields(productId: string, values: Partial<Record<JsonField, Prisma.InputJsonValue>>, extra: Prisma.ProductUpdateInput = {}): Promise<QuickEditResult> {
  const current = await prisma.product.findUnique({ where: { id: productId }, select: { fieldUpdatedAt: true } });
  if (!current) return { ok: false, error: "El producto no existe." };
  // Marca de «editado a mano», igual que los campos simples: los syncs la respetan.
  const fieldUpdatedAt = mergeFieldTimestamps(current.fieldUpdatedAt, Object.keys(values), new Date().toISOString());
  await prisma.product.update({ where: { id: productId }, data: { ...values, ...extra, fieldUpdatedAt } });
  refreshProductViews(productId);
  return { ok: true };
}

const contentSchema = z.object({
  productId: idSchema,
  keyFeatures: z.array(z.string()),
  featuresInSpanish: z.boolean(),
  specifications: z.array(z.object({ group: z.string(), label: z.string(), value: z.string() })),
});

/** Características destacadas y especificaciones. */
export async function saveQuickEditContent(input: z.input<typeof contentSchema>): Promise<QuickEditResult> {
  await requireQuickEdit();
  const parsed = contentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const features = cleanFeatures(parsed.data.keyFeatures);
  if (!features.ok) return features;
  const specs = cleanSpecs(parsed.data.specifications);
  if (!specs.ok) return specs;
  const current = await prisma.product.findUnique({ where: { id: parsed.data.productId }, select: { translatedAt: true } });
  if (!current) return { ok: false, error: "El producto no existe." };
  // Las características se le muestran al cliente solo si la ficha está en castellano (translatedAt).
  const translatedAt = parsed.data.featuresInSpanish ? (current.translatedAt ?? new Date()) : null;
  return saveJsonFields(
    parsed.data.productId,
    { keyFeatures: features.data, specifications: specs.data },
    { translatedAt }
  );
}

const docsSchema = z.object({ productId: idSchema, documents: z.array(z.object({ name: z.string(), url: z.string() })) });

/** Documentos descargables (por dirección). */
export async function saveQuickEditDocuments(input: z.input<typeof docsSchema>): Promise<QuickEditResult> {
  await requireQuickEdit();
  const parsed = docsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };
  const docs = cleanDocs(parsed.data.documents);
  if (!docs.ok) return docs;
  return saveJsonFields(parsed.data.productId, { documents: docs.data });
}

const classificationSchema = z.object({
  productId: idSchema,
  brandId: z.string().max(64).nullable(),
  categoryId: z.string().max(64).nullable(),
  lineId: z.string().max(64).nullable(),
  commercialTag: z.string().max(40).nullable(),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  isDiscontinued: z.boolean(),
  stockStatus: z.enum(["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK", "ON_REQUEST", "UNKNOWN"]),
  stockQuantity: z.number().int().min(0).max(1_000_000).nullable(),
  kind: z.enum(["PRINCIPAL", "ACCESORIO"]),
});

/**
 * Marca, rubro, serie, cartel, destacado, visible, discontinuado y stock propio.
 * El rubro pasa por la revisión de precios si hay reglas por rubro (lo decide upsertProduct).
 */
export async function saveQuickEditClassification(input: z.input<typeof classificationSchema>): Promise<QuickEditResult> {
  await requireQuickEdit();
  const parsed = classificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const { productId, isDiscontinued, ...patch } = parsed.data;
  const saved = await saveProductPatch(productId, patch);
  if (!saved.ok) return saved;
  // «Discontinuado por el fabricante» no está en el formulario del admin: se guarda aparte.
  const current = await prisma.product.findUnique({ where: { id: productId }, select: { isDiscontinued: true, fieldUpdatedAt: true } });
  if (current && current.isDiscontinued !== isDiscontinued) {
    await prisma.product.update({
      where: { id: productId },
      data: { isDiscontinued, fieldUpdatedAt: mergeFieldTimestamps(current.fieldUpdatedAt, ["isDiscontinued"], new Date().toISOString()) },
    });
    refreshProductViews(productId);
  }
  return saved;
}
