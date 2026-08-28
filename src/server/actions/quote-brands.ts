"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { loadQuoteForUser } from "@/lib/quote-access";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { permissionsHave } from "@/lib/permissions";
import { searchProductImages } from "@/services/serper";
import { storeQuoteBlob } from "@/server/actions/quote-images";
import type { BrandsDisplayMode } from "@/lib/quote-brands";

async function canManageLibrary() {
  const { permissions } = await getCurrentPermissions();
  return permissions.fullAccess || permissionsHave(permissions, "quotes.manage_library");
}

async function persistRemoteLogo(pathname: string, url: string) {
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buf = await res.arrayBuffer();
    const stored = await storeQuoteBlob(pathname, buf, res.headers.get("content-type") || "image/png");
    return stored || url;
  } catch {
    return url;
  }
}

export async function listBrandLibrary() {
  await getCurrentPermissions();
  return prisma.quoteBrandLogo.findMany({
    where: { isActive: true },
    orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
    include: { brand: { select: { id: true, name: true } } },
  });
}

export async function saveBrandLibraryLogo(input: {
  id?: string;
  label: string;
  url: string;
  brandId?: string | null;
  sortOrder?: number;
}): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!(await canManageLibrary())) return { ok: false, error: "Sin permiso." };
  const label = input.label.trim();
  const url = input.url.trim();
  if (!label || !url) return { ok: false, error: "Nombre y URL requeridos." };

  if (input.id) {
    await prisma.quoteBrandLogo.update({
      where: { id: input.id },
      data: {
        label,
        url,
        brandId: input.brandId || null,
        sortOrder: input.sortOrder ?? 0,
      },
    });
    revalidatePath("/admin/settings/quotes/marcas");
    return { ok: true, id: input.id };
  }

  const max = await prisma.quoteBrandLogo.aggregate({ _max: { sortOrder: true } });
  const created = await prisma.quoteBrandLogo.create({
    data: {
      label,
      url,
      brandId: input.brandId || null,
      sortOrder: (max._max.sortOrder ?? -1) + 1,
    },
  });
  revalidatePath("/admin/settings/quotes/marcas");
  return { ok: true, id: created.id };
}

export async function deleteBrandLibraryLogo(id: string): Promise<{ ok: boolean; error?: string }> {
  if (!(await canManageLibrary())) return { ok: false, error: "Sin permiso." };
  await prisma.quoteBrandLogo.update({ where: { id }, data: { isActive: false } });
  revalidatePath("/admin/settings/quotes/marcas");
  return { ok: true };
}

export async function searchBrandLogoImages(query: string) {
  await getCurrentPermissions();
  return searchProductImages(query, 8);
}

export async function setQuoteBrandsMode(
  quoteId: string,
  mode: BrandsDisplayMode | null
): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };

  await prisma.quote.update({
    where: { id: quoteId },
    data: { brandsMode: mode },
  });

  if (mode === "individual") {
    await syncQuoteBrandSelections(quoteId);
  }

  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

/** Rellena logos individuales a partir de marcas en la planilla + biblioteca. */
export async function syncQuoteBrandSelections(quoteId: string): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  const products = await prisma.quoteItem.findMany({
    where: { quoteId, productId: { not: null } },
    select: {
      product: {
        select: {
          brandId: true,
          brand: { select: { id: true, name: true, logoUrl: true } },
        },
      },
    },
  });

  const byBrand = new Map<string, { name: string; logoUrl: string | null }>();
  for (const row of products) {
    const brand = row.product?.brand;
    if (!brand) continue;
    if (!byBrand.has(brand.id)) {
      byBrand.set(brand.id, { name: brand.name, logoUrl: brand.logoUrl });
    }
  }

  const [library, existing] = await Promise.all([
    prisma.quoteBrandLogo.findMany({
      where: { isActive: true, brandId: { in: [...byBrand.keys()] } },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.quoteBrandSelection.findMany({ where: { quoteId } }),
  ]);

  const libraryByBrand = new Map<string, (typeof library)[number]>();
  for (const logo of library) {
    if (logo.brandId && !libraryByBrand.has(logo.brandId)) {
      libraryByBrand.set(logo.brandId, logo);
    }
  }

  const existingLabels = new Set(existing.map((e) => e.label.toLowerCase()));
  let sort = existing.reduce((m, row) => Math.max(m, row.sortOrder), -1);

  for (const [brandId, info] of byBrand) {
    if (existingLabels.has(info.name.toLowerCase())) continue;
    const lib = libraryByBrand.get(brandId);
    const url = lib?.url || info.logoUrl || "";
    if (!url) continue;
    sort += 1;
    await prisma.quoteBrandSelection.create({
      data: {
        quoteId,
        libraryLogoId: lib?.id || null,
        label: lib?.label || info.name,
        url,
        visible: true,
        sortOrder: sort,
      },
    });
    existingLabels.add(info.name.toLowerCase());
  }

  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function toggleQuoteBrandVisibility(
  selectionId: string,
  visible: boolean
): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.quoteBrandSelection.findUnique({ where: { id: selectionId } });
  if (!row) return { ok: false, error: "Logo no encontrado." };
  const loaded = await loadQuoteForUser(row.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return { ok: false, error: "No editable." };

  await prisma.quoteBrandSelection.update({ where: { id: selectionId }, data: { visible } });
  revalidatePath(`/admin/quotes/${row.quoteId}`);
  return { ok: true };
}

export async function removeQuoteBrandSelection(selectionId: string): Promise<{ ok: boolean; error?: string }> {
  const row = await prisma.quoteBrandSelection.findUnique({ where: { id: selectionId } });
  if (!row) return { ok: false, error: "Logo no encontrado." };
  const loaded = await loadQuoteForUser(row.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return { ok: false, error: "No editable." };

  await prisma.quoteBrandSelection.delete({ where: { id: selectionId } });
  revalidatePath(`/admin/quotes/${row.quoteId}`);
  return { ok: true };
}

export async function addQuoteBrandSelection(input: {
  quoteId: string;
  label: string;
  url: string;
  saveToLibrary?: boolean;
  brandId?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(input.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };

  const label = input.label.trim();
  let url = input.url.trim();
  if (!label || !url) return { ok: false, error: "Nombre y imagen requeridos." };

  url = await persistRemoteLogo(`quotes/${input.quoteId}/brands/${Date.now()}.png`, url);

  let libraryLogoId: string | null = null;
  if (input.saveToLibrary && (await canManageLibrary())) {
    const max = await prisma.quoteBrandLogo.aggregate({ _max: { sortOrder: true } });
    const lib = await prisma.quoteBrandLogo.create({
      data: {
        label,
        url,
        brandId: input.brandId || null,
        sortOrder: (max._max.sortOrder ?? -1) + 1,
      },
    });
    libraryLogoId = lib.id;
  }

  const maxSort = await prisma.quoteBrandSelection.aggregate({
    where: { quoteId: input.quoteId },
    _max: { sortOrder: true },
  });

  await prisma.quoteBrandSelection.create({
    data: {
      quoteId: input.quoteId,
      libraryLogoId,
      label,
      url,
      visible: true,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/admin/quotes/${input.quoteId}`);
  return { ok: true };
}

export async function addLibraryLogoToQuote(
  quoteId: string,
  libraryLogoId: string
): Promise<{ ok: boolean; error?: string }> {
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "COT emitida." };

  const lib = await prisma.quoteBrandLogo.findUnique({ where: { id: libraryLogoId } });
  if (!lib || !lib.isActive) return { ok: false, error: "Logo no encontrado." };

  const dup = await prisma.quoteBrandSelection.findFirst({
    where: { quoteId, libraryLogoId },
  });
  if (dup) return { ok: false, error: "Ese logo ya está en la cotización." };

  const maxSort = await prisma.quoteBrandSelection.aggregate({
    where: { quoteId },
    _max: { sortOrder: true },
  });

  await prisma.quoteBrandSelection.create({
    data: {
      quoteId,
      libraryLogoId: lib.id,
      label: lib.label,
      url: lib.url,
      visible: true,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });

  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}
