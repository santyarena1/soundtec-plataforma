"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { parseExcelBuffer, applyMapping, type ColumnMapping } from "@/services/excel";
import { suggestColumnMapping, heuristicSuggestMapping } from "@/services/openai";
import { slugify } from "@/lib/utils";

const createSchema = z.object({
  brandId: z.string().optional().nullable(),
  newBrandName: z.string().optional().nullable(),
  distributorId: z.string().optional().nullable(),
  newDistributorName: z.string().optional().nullable(),
  priceListName: z.string().min(2).max(160),
});

export async function startImportFromExcel(formData: FormData): Promise<void> {
  await requireAdmin();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return;

  const parsed = createSchema.safeParse({
    brandId: formData.get("brandId") || null,
    newBrandName: formData.get("newBrandName") || null,
    distributorId: formData.get("distributorId") || null,
    newDistributorName: formData.get("newDistributorName") || null,
    priceListName: formData.get("priceListName") || "Lista importada",
  });
  if (!parsed.success) return;

  let brandId = parsed.data.brandId || null;
  if (!brandId && parsed.data.newBrandName) {
    const brand = await prisma.brand.create({
      data: { name: parsed.data.newBrandName, slug: slugify(parsed.data.newBrandName) },
    });
    brandId = brand.id;
  }

  let distributorId = parsed.data.distributorId || null;
  if (!distributorId && parsed.data.newDistributorName) {
    const distributor = await prisma.distributor.create({
      data: { name: parsed.data.newDistributorName, slug: slugify(parsed.data.newDistributorName) },
    });
    distributorId = distributor.id;
  }

  const arrayBuffer = await file.arrayBuffer();
  const parsedExcel = parseExcelBuffer(Buffer.from(arrayBuffer));

  const priceList = await prisma.priceList.create({
    data: {
      name: parsed.data.priceListName,
      brandId,
      distributorId,
      sourceType: "EXCEL",
      uploadedFileUrl: null,
      currency: "USD",
      status: "DRAFT",
    },
  });

  let brandName: string | undefined;
  let distributorName: string | undefined;
  if (brandId) {
    const b = await prisma.brand.findUnique({ where: { id: brandId }, select: { name: true } });
    brandName = b?.name;
  }
  if (distributorId) {
    const d = await prisma.distributor.findUnique({ where: { id: distributorId }, select: { name: true } });
    distributorName = d?.name;
  }

  let suggestions = heuristicSuggestMapping(parsedExcel.headers);
  try {
    suggestions = await suggestColumnMapping(parsedExcel.headers, { brand: brandName, distributor: distributorName });
  } catch {
    // ya quedó la heurística.
  }

  const batch = await prisma.importBatch.create({
    data: {
      priceListId: priceList.id,
      distributorId,
      brandId,
      fileName: file.name,
      status: "MAPPING",
      totalRows: parsedExcel.totalRows,
      detectedHeaders: parsedExcel.headers as unknown as Prisma.InputJsonValue,
      appliedMappingJson: suggestions as unknown as Prisma.InputJsonValue,
      rawProducts: {
        create: parsedExcel.rows.map((row) => ({
          rawJson: row as unknown as Prisma.InputJsonValue,
          approvalStatus: "PENDING",
        })),
      },
    },
  });

  revalidatePath("/admin/imports");
  redirect(`/admin/imports/${batch.id}`);
}

const mappingSchema = z.object({
  batchId: z.string().min(1),
  mappingJson: z.string().min(2),
  saveAsProfile: z.string().optional(),
  profileName: z.string().optional(),
});

export async function saveMapping(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = mappingSchema.safeParse({
    batchId: formData.get("batchId"),
    mappingJson: formData.get("mappingJson"),
    saveAsProfile: formData.get("saveAsProfile")?.toString(),
    profileName: formData.get("profileName")?.toString(),
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  let mapping: ColumnMapping;
  try {
    mapping = JSON.parse(parsed.data.mappingJson);
  } catch {
    return { ok: false, error: "JSON inválido" };
  }

  const batch = await prisma.importBatch.update({
    where: { id: parsed.data.batchId },
    data: { appliedMappingJson: mapping as unknown as Prisma.InputJsonValue, status: "REVIEWING" },
  });

  if (parsed.data.saveAsProfile === "on" && parsed.data.profileName) {
    await prisma.columnMappingProfile.create({
      data: {
        name: parsed.data.profileName,
        brandId: batch.brandId,
        distributorId: batch.distributorId,
        sourceType: "EXCEL",
        mappingJson: mapping as unknown as Prisma.InputJsonValue,
      },
    });
  }

  // Pre-aplicar mapping a las filas para mostrar normalizedJson
  const rows = await prisma.rawImportedProduct.findMany({ where: { importBatchId: batch.id } });
  await Promise.all(
    rows.map((row) =>
      prisma.rawImportedProduct.update({
        where: { id: row.id },
        data: {
          normalizedJson: applyMapping(row.rawJson as Record<string, unknown>, mapping) as unknown as Prisma.InputJsonValue,
        },
      })
    )
  );

  revalidatePath(`/admin/imports/${batch.id}`);
  return { ok: true };
}

const approveSchema = z.object({
  batchId: z.string().min(1),
});

export async function approveAllRows(formData: FormData): Promise<{ ok: boolean; processed?: number; errors?: number; error?: string }> {
  await requireAdmin();
  const parsed = approveSchema.safeParse({ batchId: formData.get("batchId") });
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const batch = await prisma.importBatch.findUnique({
    where: { id: parsed.data.batchId },
    include: { rawProducts: true },
  });
  if (!batch) return { ok: false, error: "Batch no encontrado" };

  let processed = 0;
  let errors = 0;

  for (const raw of batch.rawProducts) {
    const draft = (raw.normalizedJson as Record<string, unknown>) || null;
    if (!draft || !draft.name) {
      await prisma.rawImportedProduct.update({
        where: { id: raw.id },
        data: { approvalStatus: "REJECTED", errorMessage: "Fila sin nombre normalizado." },
      });
      errors++;
      continue;
    }

    try {
      const sku = String(draft.sku || draft.supplierSku || `${batch.id.slice(0, 6)}-${raw.id.slice(0, 6)}`);
      const supplierSku = draft.supplierSku ? String(draft.supplierSku) : null;
      const name = String(draft.name);

      const product = await prisma.product.upsert({
        where: { internalSku: sku },
        update: {
          normalizedName: name,
          originalName: name,
          supplierSku,
          baseCostUsd: Number(draft.baseCostUsd ?? 0),
          currency: String(draft.currency || "USD"),
          shortDescription: draft.shortDescription ? String(draft.shortDescription) : undefined,
          longDescription: draft.longDescription ? String(draft.longDescription) : undefined,
          discountPercent: draft.discountPercent != null ? Number(draft.discountPercent) : undefined,
          brandId: batch.brandId,
          distributorId: batch.distributorId,
        },
        create: {
          internalSku: sku,
          supplierSku,
          normalizedName: name,
          originalName: name,
          baseCostUsd: Number(draft.baseCostUsd ?? 0),
          currency: String(draft.currency || "USD"),
          shortDescription: draft.shortDescription ? String(draft.shortDescription) : null,
          longDescription: draft.longDescription ? String(draft.longDescription) : null,
          discountPercent: draft.discountPercent != null ? Number(draft.discountPercent) : null,
          stockStatus: "UNKNOWN",
          brandId: batch.brandId,
          distributorId: batch.distributorId,
          images: draft.imageUrl
            ? {
                create: [
                  { url: String(draft.imageUrl), alt: name, isPrimary: true, source: "excel" },
                ],
              }
            : undefined,
        },
      });

      await prisma.rawImportedProduct.update({
        where: { id: raw.id },
        data: { approvalStatus: "APPROVED", productId: product.id },
      });
      processed++;
    } catch (error) {
      console.error("approveAllRows error", error);
      await prisma.rawImportedProduct.update({
        where: { id: raw.id },
        data: {
          approvalStatus: "REJECTED",
          errorMessage: error instanceof Error ? error.message : "Error desconocido",
        },
      });
      errors++;
    }
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: "COMPLETED", processedRows: processed, errorRows: errors },
  });
  if (batch.priceListId) {
    await prisma.priceList.update({ where: { id: batch.priceListId }, data: { status: "ACTIVE" } });
  }

  revalidatePath("/admin/imports");
  revalidatePath(`/admin/imports/${batch.id}`);
  return { ok: true, processed, errors };
}
