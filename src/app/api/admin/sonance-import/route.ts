import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting, setSetting } from "@/lib/settings";
import { slugify } from "@/lib/utils";
import {
  parseSonanceExcel,
  downloadFromBoxLink,
  type SonanceProduct,
} from "@/services/sonance-import";
import { fetchFromPortal } from "@/services/sonance-portal";
import { revalidatePath } from "next/cache";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export type CategoryTarget = "categoria" | "familia" | "rubro" | "subrubro";

const TARGET_KEY = "sonance.category_target";
const TRANSLATIONS_KEY = "sonance.category_translations";

export interface SonancePreviewItem {
  supplierSku: string;
  name: string;
  brand: string;
  category: string; // raw category from Excel (e.g. "IN-CEILING SPEAKERS")
  subcategory: string;
  uom: string;
  newPrice: number;
  productId: string | null;
  productName: string | null;
  currentPrice: number | null;
  currentCategoryLabel: string | null; // current value in chosen target field
  priceChanged: boolean;
  isNew: boolean;
}

export interface SonancePreviewResponse {
  ok: boolean;
  error?: string;
  fileType?: string;
  totalParsed?: number;
  matched?: number;
  newProducts?: number;
  priceChanges?: number;
  brandCounts?: Record<string, number>;
  items?: SonancePreviewItem[];
  uniqueCategories?: string[];
  translations?: Record<string, string>;
  target?: CategoryTarget;
}

async function loadTranslations(): Promise<Record<string, string>> {
  const raw = await getSetting(TRANSLATIONS_KEY, "{}");
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

async function loadTarget(): Promise<CategoryTarget> {
  const raw = await getSetting(TARGET_KEY, "rubro");
  return (["categoria", "familia", "rubro", "subrubro"].includes(raw) ? raw : "rubro") as CategoryTarget;
}

function categoryLabelFor(target: CategoryTarget, product: {
  categoryName: string | null;
  familyName: string | null;
  familia: string | null;
  tipo: string | null;
}): string | null {
  if (target === "categoria") return product.categoryName;
  if (target === "familia") return product.familyName;
  if (target === "rubro") return product.familia;
  return product.tipo;
}

// ── shared helpers ────────────────────────────────────────────────────────────

async function buildPreviewFromProducts(
  products: SonanceProduct[],
  brandCounts: Record<string, number>,
  fileType: string
): Promise<SonancePreviewResponse> {
  const [target, translations] = await Promise.all([loadTarget(), loadTranslations()]);

  const skus = products.map((p) => p.supplierSku);
  const existing = await prisma.product.findMany({
    where: { supplierSku: { in: skus } },
    select: {
      id: true,
      supplierSku: true,
      normalizedName: true,
      baseCostUsd: true,
      familia: true,
      tipo: true,
      category: { select: { name: true } },
      family: { select: { name: true } },
    },
  });
  const existingMap = new Map(existing.map((p) => [p.supplierSku, p]));

  const items: SonancePreviewItem[] = products.map((p) => {
    const match = existingMap.get(p.supplierSku) ?? null;
    const curPrice = match ? Number(match.baseCostUsd) : null;
    const currentLabel = match
      ? categoryLabelFor(target, {
          categoryName: match.category?.name ?? null,
          familyName: match.family?.name ?? null,
          familia: match.familia,
          tipo: match.tipo,
        })
      : null;
    return {
      supplierSku: p.supplierSku,
      name: p.name,
      brand: p.brand,
      category: p.category,
      subcategory: p.subcategory,
      uom: p.uom,
      newPrice: p.price,
      productId: match?.id ?? null,
      productName: match?.normalizedName ?? null,
      currentPrice: curPrice,
      currentCategoryLabel: currentLabel,
      priceChanged: curPrice !== null && curPrice !== p.price,
      isNew: match === null,
    };
  });

  const matched = items.filter((i) => !i.isNew);
  const newProducts = items.filter((i) => i.isNew);
  const priceChanges = matched.filter((i) => i.priceChanged);
  const uniqueCategories = Array.from(
    new Set(products.map((p) => p.category.trim()).filter((c) => c.length > 0))
  ).sort();

  return {
    ok: true,
    fileType,
    totalParsed: products.length,
    matched: matched.length,
    newProducts: newProducts.length,
    priceChanges: priceChanges.length,
    brandCounts,
    items,
    uniqueCategories,
    translations,
    target,
  };
}

async function buildPreviewFromBuffers(buffers: Buffer[]): Promise<SonancePreviewResponse> {
  const allProducts: SonanceProduct[] = [];
  const brandCounts: Record<string, number> = {};
  let fileType = "sonance-iport";
  for (const buf of buffers) {
    const parsed = parseSonanceExcel(buf);
    fileType = parsed.fileType;
    allProducts.push(...parsed.products);
    for (const [k, v] of Object.entries(parsed.brandCounts)) {
      brandCounts[k] = (brandCounts[k] ?? 0) + v;
    }
  }
  const bySku = new Map<string, SonanceProduct>();
  for (const p of allProducts) bySku.set(p.supplierSku, p);
  return buildPreviewFromProducts(Array.from(bySku.values()), brandCounts, fileType);
}

// GET — prefer my.sonance.com API; fallback to Box links
export async function GET() {
  try {
    await requireAdmin();
    const [user, pass, url1, url2, url3] = await Promise.all([
      getSetting("sonance.portal_username", ""),
      getSetting("sonance.portal_password", ""),
      getSetting("sonance.box_url_1", ""),
      getSetting("sonance.box_url_2", ""),
      getSetting("sonance.box_url_3", ""),
    ]);

    // Primary: my.sonance.com portal API (structured data: SKU + name + price + brand)
    if (user && pass) {
      const portal = await fetchFromPortal();
      return NextResponse.json(
        await buildPreviewFromProducts(portal.products, portal.brandCounts, "sonance-portal")
      );
    }

    // Fallback: Box shared links → Excel parsing
    const urls = [url1, url2, url3].filter(Boolean);
    if (urls.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Configurá credenciales de my.sonance.com o links de Box para la sync automática." },
        { status: 400 }
      );
    }
    const buffers = await Promise.all(urls.map(downloadFromBoxLink));
    return NextResponse.json(await buildPreviewFromBuffers(buffers));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies SonancePreviewResponse, { status: 500 });
  }
}

// POST — parse uploaded file, return preview
export async function POST(req: NextRequest) {
  try {
    await requireAdmin();
    const formData = await req.formData();
    const file = formData.get("file");
    if (!(file instanceof File))
      return NextResponse.json({ ok: false, error: "No se recibió archivo" }, { status: 400 });
    const buffer = Buffer.from(await file.arrayBuffer());
    return NextResponse.json(await buildPreviewFromBuffers([buffer]));
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error } satisfies SonancePreviewResponse, { status: 500 });
  }
}

// ── FK upsert helpers ─────────────────────────────────────────────────────────

async function upsertCategoryByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.category.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.category.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

async function upsertFamilyByName(name: string): Promise<string> {
  const normalized = name.trim();
  const existing = await prisma.productFamily.findFirst({
    where: { name: { equals: normalized, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.productFamily.create({
    data: { name: normalized, slug: slugify(normalized) },
    select: { id: true },
  });
  return created.id;
}

// PUT — apply changes. Body: { items, createNew, translations, target }
export async function PUT(req: NextRequest) {
  try {
    await requireAdmin();

    const body = (await req.json().catch(() => ({}))) as {
      items?: SonancePreviewItem[];
      createNew?: boolean;
      translations?: Record<string, string>;
      target?: CategoryTarget;
    };
    const items = body.items ?? [];
    const createNew = !!body.createNew;
    const target = (
      ["categoria", "familia", "rubro", "subrubro"].includes(body.target ?? "")
        ? body.target
        : await loadTarget()
    ) as CategoryTarget;
    const translations = body.translations ?? (await loadTranslations());

    // Persist for next sync
    await Promise.all([
      setSetting(TARGET_KEY, target),
      setSetting(TRANSLATIONS_KEY, JSON.stringify(translations)),
    ]);

    // Resolve brand IDs once
    const brandNames = [...new Set(items.map((i) => i.brand))];
    const brands = await prisma.brand.findMany({
      where: { name: { in: brandNames } },
      select: { id: true, name: true },
    });
    const brandIdMap = new Map(brands.map((b) => [b.name, b.id]));

    // Pre-upsert all FK rows once
    const fkIdByEs = new Map<string, string>();
    if (target === "categoria" || target === "familia") {
      const uniqueEs = Array.from(
        new Set(
          items
            .map((i) => (translations[(i.category ?? "").trim()] ?? "").trim())
            .filter((s) => s.length > 0)
        )
      );
      for (const esName of uniqueEs) {
        const id = target === "categoria"
          ? await upsertCategoryByName(esName)
          : await upsertFamilyByName(esName);
        fkIdByEs.set(esName, id);
      }
    }

    function categoryFieldsFor(rawCategory: string, fallback?: { familia?: string | null; tipo?: string | null }) {
      const es = (translations[rawCategory.trim()] ?? "").trim();
      const data: Record<string, unknown> = {};
      if (es.length === 0) {
        // No translation provided — only fall back for new product creation
        if (fallback) {
          if (fallback.familia) data.familia = fallback.familia;
          if (fallback.tipo) data.tipo = fallback.tipo;
        }
        return data;
      }
      if (target === "categoria") {
        const fkId = fkIdByEs.get(es);
        if (fkId) data.categoryId = fkId;
      } else if (target === "familia") {
        const fkId = fkIdByEs.get(es);
        if (fkId) data.familyId = fkId;
      } else if (target === "rubro") {
        data.familia = es;
      } else if (target === "subrubro") {
        data.tipo = es;
      }
      return data;
    }

    let updated = 0;
    let created = 0;
    let categoryWrites = 0;

    for (const item of items) {
      if (!item.isNew) {
        if (!item.productId) continue;
        const catFields = categoryFieldsFor(item.category);
        const willWriteCategory = Object.keys(catFields).length > 0;
        if (!item.priceChanged && !willWriteCategory) continue;
        const data: Record<string, unknown> = {};
        if (item.priceChanged) data.baseCostUsd = item.newPrice;
        Object.assign(data, catFields);
        await prisma.product.update({ where: { id: item.productId }, data });
        updated++;
        if (willWriteCategory) categoryWrites++;
      } else if (createNew) {
        const brandId = brandIdMap.get(item.brand) ?? null;
        const catFields = categoryFieldsFor(item.category, {
          familia: item.category || null,
          tipo: item.subcategory || null,
        });
        await prisma.product.create({
          data: {
            normalizedName: item.name,
            originalName: item.name,
            supplierSku: item.supplierSku,
            baseCostUsd: item.newPrice,
            brandId,
            ...catFields,
            isActive: false,
          },
        });
        created++;
        if (Object.keys(catFields).length > 0) categoryWrites++;
      }
    }

    revalidatePath("/admin/products");
    revalidatePath("/portal/products");
    revalidatePath("/admin/sonance-import");

    return NextResponse.json({ ok: true, updated, created, categoryWrites, target });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
