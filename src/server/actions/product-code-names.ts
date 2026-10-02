"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { mergeFieldTimestamps } from "@/lib/field-timestamps";
import { buildProductSearchKey } from "@/lib/search-key";
import {
  SONANCE_PORTAL_BRANDS,
  codeNameFor,
  isSonancePortalBrand,
  type CodeNameSource,
} from "@/lib/product-code-name";

export interface CodeNameChange {
  id: string;
  brand: string;
  source: CodeNameSource;
  from: string;
  to: string;
}

const APPLY_CHUNK = 100;

/** Productos de Sonance-portal o SoundTube cuyo nombre no es todavía su código. */
async function computeChanges(): Promise<CodeNameChange[]> {
  const soundTubeRows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "Product"
    WHERE ("sourceMetadata"->'soundtube') IS NOT NULL
  `;
  const soundTubeIds = new Set(soundTubeRows.map((r) => r.id));

  const products = await prisma.product.findMany({
    where: {
      OR: [
        { id: { in: [...soundTubeIds] } },
        { brand: { name: { in: [...SONANCE_PORTAL_BRANDS], mode: "insensitive" } } },
      ],
    },
    select: {
      id: true,
      normalizedName: true,
      supplierSku: true,
      modelNumber: true,
      brand: { select: { name: true } },
    },
  });

  return products.flatMap((p): CodeNameChange[] => {
    const brand = p.brand?.name ?? "";
    const source: CodeNameSource | null = soundTubeIds.has(p.id)
      ? "soundtube"
      : isSonancePortalBrand(brand)
        ? "sonance"
        : null;
    if (!source) return [];
    const to = codeNameFor({ source, modelNumber: p.modelNumber, supplierSku: p.supplierSku });
    if (!to || to === p.normalizedName.trim()) return [];
    return [{ id: p.id, brand, source, from: p.normalizedName, to }];
  });
}

export async function previewCodeNames(): Promise<{ changes: CodeNameChange[] }> {
  await requireAdmin();
  const changes = await computeChanges();
  changes.sort((a, b) => a.brand.localeCompare(b.brand) || a.to.localeCompare(b.to));
  return { changes };
}

/**
 * Pasa el nombre al código. El título anterior queda en originalName (si
 * estaba vacío) para no perder la descripción.
 */
export async function applyCodeNames(): Promise<{ ok: boolean; updated: number; error?: string }> {
  await requireAdmin();
  try {
    const changes = await computeChanges();
    const rows = await prisma.product.findMany({
      where: { id: { in: changes.map((c) => c.id) } },
      select: {
        id: true,
        internalSku: true,
        supplierSku: true,
        originalName: true,
        modelNumber: true,
        manufacturerItem: true,
        fieldUpdatedAt: true,
        brand: { select: { name: true } },
      },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const nowIso = new Date().toISOString();

    let updated = 0;
    for (let i = 0; i < changes.length; i += APPLY_CHUNK) {
      const chunk = changes.slice(i, i + APPLY_CHUNK);
      await prisma.$transaction(
        chunk.flatMap((change) => {
          const row = byId.get(change.id);
          if (!row) return [];
          const originalName = row.originalName.trim() ? row.originalName : change.from;
          return [
            prisma.product.update({
              where: { id: change.id },
              data: {
                normalizedName: change.to,
                originalName,
                searchKey: buildProductSearchKey({
                  internalSku: row.internalSku,
                  supplierSku: row.supplierSku,
                  normalizedName: change.to,
                  originalName,
                  modelNumber: row.modelNumber,
                  manufacturerItem: row.manufacturerItem,
                  brandName: row.brand?.name,
                }),
                fieldUpdatedAt: mergeFieldTimestamps(row.fieldUpdatedAt, ["normalizedName"], nowIso),
              },
            }),
          ];
        })
      );
      updated += chunk.length;
    }

    revalidatePath("/admin/products");
    return { ok: true, updated };
  } catch (error) {
    console.error("[product-code-names] apply failed", error);
    return { ok: false, updated: 0, error: "No se pudieron renombrar los productos. Probá de nuevo." };
  }
}
