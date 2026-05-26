"use server";

import { revalidatePath } from "next/cache";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import {
  countShareablePriceListProducts,
  parseShareListFilters,
  shareListPublicUrl,
  type ShareablePriceListFilters,
} from "@/lib/shareable-price-list";
import { Prisma, ShareablePriceListStatus } from "@prisma/client";

function newShareSlug(): string {
  return randomBytes(9).toString("base64url");
}

function parseFiltersFromForm(formData: FormData): ShareablePriceListFilters {
  return parseShareListFilters({
    brandIds: formData.getAll("brandIds").map(String).filter(Boolean),
    categoryIds: formData.getAll("categoryIds").map(String).filter(Boolean),
    familyIds: formData.getAll("familyIds").map(String).filter(Boolean),
    distributorIds: formData.getAll("distributorIds").map(String).filter(Boolean),
    productIds: formData.getAll("productIds").map(String).filter(Boolean),
    excludeProductIds: formData.getAll("excludeProductIds").map(String).filter(Boolean),
    kinds: formData.getAll("kinds").map(String).filter(Boolean),
    search: formData.get("search")?.toString() || undefined,
    inStockOnly: formData.get("inStockOnly") === "on",
    hasDiscountOnly: formData.get("hasDiscountOnly") === "on",
  });
}

const upsertSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(160),
  description: z.string().max(2000).optional().nullable(),
  status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
  clientId: z.string().optional().nullable(),
  showSku: z.coerce.boolean().optional(),
  showStock: z.coerce.boolean().optional(),
  hidePrices: z.coerce.boolean().optional(),
  expiresAt: z.string().optional().nullable(),
});

export async function upsertShareablePriceList(formData: FormData): Promise<{ ok: boolean; id?: string; error?: string }> {
  await requireAdmin();
  const parsed = upsertSchema.safeParse({
    id: formData.get("id")?.toString() || undefined,
    name: formData.get("name"),
    description: formData.get("description") || null,
    status: formData.get("status") || "DRAFT",
    clientId: formData.get("clientId") || null,
    showSku: formData.get("showSku") === "on",
    showStock: formData.get("showStock") === "on",
    hidePrices: formData.get("hidePrices") === "on",
    expiresAt: formData.get("expiresAt") || null,
  });
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const filters = parseFiltersFromForm(formData);
  const expiresAt = parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null;

  if (parsed.data.id) {
    await prisma.shareablePriceList.update({
      where: { id: parsed.data.id },
      data: {
        name: parsed.data.name,
        description: parsed.data.description,
        status: parsed.data.status as ShareablePriceListStatus,
        filters: filters as Prisma.InputJsonValue,
        clientId: parsed.data.clientId || null,
        showSku: parsed.data.showSku ?? true,
        showStock: parsed.data.showStock ?? false,
        hidePrices: parsed.data.hidePrices ?? false,
        expiresAt,
      },
    });
    revalidatePath("/admin/share-lists");
    revalidatePath(`/admin/share-lists/${parsed.data.id}`);
    revalidatePath(`/lista/${formData.get("shareSlug")}`);
    return { ok: true, id: parsed.data.id };
  }

  let slug = newShareSlug();
  for (let i = 0; i < 5; i++) {
    const exists = await prisma.shareablePriceList.findUnique({ where: { shareSlug: slug } });
    if (!exists) break;
    slug = newShareSlug();
  }

  const created = await prisma.shareablePriceList.create({
    data: {
      name: parsed.data.name,
      description: parsed.data.description,
      shareSlug: slug,
      status: parsed.data.status as ShareablePriceListStatus,
      filters: filters as Prisma.InputJsonValue,
      clientId: parsed.data.clientId || null,
      showSku: parsed.data.showSku ?? true,
      showStock: parsed.data.showStock ?? false,
      hidePrices: parsed.data.hidePrices ?? false,
      expiresAt,
    },
  });

  revalidatePath("/admin/share-lists");
  return { ok: true, id: created.id };
}

export async function deleteShareablePriceList(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.shareablePriceList.delete({ where: { id } });
  revalidatePath("/admin/share-lists");
}

export async function regenerateShareSlug(formData: FormData): Promise<{ ok: boolean; slug?: string }> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return { ok: false };
  const slug = newShareSlug();
  await prisma.shareablePriceList.update({ where: { id }, data: { shareSlug: slug } });
  revalidatePath(`/admin/share-lists/${id}`);
  return { ok: true, slug };
}

export async function previewShareListCount(formData: FormData): Promise<{ count: number }> {
  await requireAdmin();
  const filters = parseFiltersFromForm(formData);
  const clientId = formData.get("clientId")?.toString() || null;
  const count = await countShareablePriceListProducts(filters, clientId);
  return { count };
}

export async function getShareListPublicUrl(listId: string): Promise<string | null> {
  await requireAdmin();
  const list = await prisma.shareablePriceList.findUnique({
    where: { id: listId },
    select: { shareSlug: true },
  });
  if (!list) return null;
  return shareListPublicUrl(list.shareSlug);
}
