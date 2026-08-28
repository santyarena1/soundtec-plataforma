import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";
import { lookupCrestronCatalog } from "@/services/crestron-catalog";
import { translateBatchCached } from "@/services/translation-cache";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

const BATCH = 6;

type MetaBag = { ItemCode?: unknown };

function itemCodeFromMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return null;
  const code = (meta as MetaBag).ItemCode;
  return typeof code === "string" && code.trim() ? code.trim() : null;
}

async function crestronBrandId() {
  const slug = slugify("CRESTRON");
  const existing = await prisma.brand.findFirst({
    where: {
      OR: [{ name: { equals: "CRESTRON", mode: "insensitive" } }, { slug }],
    },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.brand.create({
    data: { name: "CRESTRON", slug },
    select: { id: true },
  });
  return created.id;
}

async function listCandidateIds() {
  const [branded, fromMeta] = await Promise.all([
    prisma.product.findMany({
      where: { brand: { name: { contains: "crestron", mode: "insensitive" } } },
      select: { id: true },
    }),
    prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "Product"
      WHERE "sourceMetadata" IS NOT NULL
        AND COALESCE("sourceMetadata"->>'ItemCode', '') <> ''
    `,
  ]);
  return [...new Set([...branded.map((p) => p.id), ...fromMeta.map((p) => p.id)])];
}

export async function POST(req: NextRequest) {
  await requireAdmin();
  const body = (await req.json().catch(() => ({}))) as {
    offset?: number;
    batchSize?: number;
    force?: boolean;
    translate?: boolean;
  };
  const offset = Math.max(0, Number(body.offset) || 0);
  const batchSize = Math.min(Math.max(Number(body.batchSize) || BATCH, 1), 12);
  const force = body.force === true;
  const translate = body.translate !== false;

  const ids = await listCandidateIds();
  const slice = ids.slice(offset, offset + batchSize);
  const brandId = await crestronBrandId();

  let updated = 0;
  let skipped = 0;
  let withImages = 0;
  let withSpecs = 0;
  const errors: Array<{ sku: string; error: string }> = [];

  for (const id of slice) {
    const product = await prisma.product.findUnique({
      where: { id },
      include: { images: { select: { id: true } } },
    });
    if (!product) {
      skipped++;
      continue;
    }
    if (!force && product.enrichedAt && product.vendorProductUrl) {
      skipped++;
      continue;
    }

    const sku =
      itemCodeFromMeta(product.sourceMetadata) ||
      product.internalSku?.trim() ||
      product.supplierSku?.trim() ||
      "";
    if (!sku) {
      skipped++;
      continue;
    }

    try {
      const page = await lookupCrestronCatalog(sku);
      if (!page) {
        skipped++;
        continue;
      }

      const overview = page.overview || page.shortDescription || "";
      const features = page.keyFeatures.length
        ? `\n\nCaracterísticas:\n${page.keyFeatures.map((f) => `• ${f}`).join("\n")}`
        : "";
      let shortEs = page.shortDescription || page.tagline || "";
      let longEs = `${overview}${features}`.trim();

      if (translate) {
        const toTranslate = [shortEs, longEs].filter((t) => t.length > 0);
        const map = await translateBatchCached(toTranslate, "long_desc");
        if (shortEs) shortEs = map.get(shortEs) ?? shortEs;
        if (longEs) longEs = map.get(longEs) ?? longEs;
      }

      const specs = page.specs.slice(0, 60).map((s) => ({
        label: s.label,
        value: s.value,
        group: s.group,
      }));

      const htmlParts: string[] = [];
      if (longEs) {
        htmlParts.push(
          `<p>${longEs
            .split(/\n\n+/)
            .map((p) => p.replace(/</g, "&lt;").replace(/\n/g, "<br/>"))
            .join("</p><p>")}</p>`
        );
      }

      const data: Prisma.ProductUpdateInput = {
        vendorProductUrl: page.url,
        modelNumber: product.modelNumber || sku,
        manufacturerItem: product.manufacturerItem || page.materialNumber || sku,
        enrichedAt: new Date(),
        brand: { connect: { id: brandId } },
      };
      if ((!product.shortDescription || force) && shortEs) data.shortDescription = shortEs.slice(0, 600);
      if ((!product.longDescription || force) && longEs) {
        data.longDescription = longEs.slice(0, 12000);
        data.aiGeneratedDescription = false;
      }
      if ((!product.htmlContent || force) && htmlParts.length) data.htmlContent = htmlParts.join("");
      if ((!product.specifications || force) && specs.length) {
        data.specifications = specs as unknown as Prisma.InputJsonValue;
        withSpecs++;
      }
      if (!product.metaTitle && page.name) data.metaTitle = page.name.slice(0, 180);
      if (!product.metaDescription && shortEs) data.metaDescription = shortEs.slice(0, 300);

      await prisma.product.update({ where: { id }, data });

      if (product.images.length === 0 && page.imageUrls.length > 0) {
        await prisma.productImage.createMany({
          data: page.imageUrls.slice(0, 4).map((url, index) => ({
            productId: id,
            url,
            alt: page.name,
            source: "crestron-catalog",
            isPrimary: index === 0,
          })),
        });
        withImages++;
      }
      updated++;
    } catch (err) {
      errors.push({
        sku,
        error: err instanceof Error ? err.message : "Error al enriquecer",
      });
    }
  }

  revalidatePath("/admin/products");
  revalidatePath("/admin/crestron-sync");
  revalidatePath("/portal/products");

  const nextOffset = offset + slice.length;
  return NextResponse.json({
    ok: true,
    total: ids.length,
    processed: slice.length,
    updated,
    skipped,
    withImages,
    withSpecs,
    errors,
    done: nextOffset >= ids.length,
    nextOffset: nextOffset >= ids.length ? null : nextOffset,
  });
}
