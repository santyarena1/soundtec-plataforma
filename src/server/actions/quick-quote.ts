"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission } from "@/lib/quote-access";
import { createQuoteShell } from "@/server/actions/quotes";
import { issueQuote } from "@/server/actions/quote-export";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent, getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { buildProductSearchWhere, sortBySearchRelevance } from "@/lib/product-search";

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().positive(),
  unitPriceUsd: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  note: z.string().max(1000).default(""),
  included: z.boolean().default(false),
});
const schema = z.object({
  clientId: z.string().nullable(),
  contactName: z.string().max(160).default(""),
  reference: z.string().min(1).max(200),
  layoutKey: z.enum(["COMPACT", "STANDARD", "EDITORIAL"]).default("COMPACT"),
  validityDays: z.number().int().min(1).max(365),
  issue: z.boolean(),
  items: z.array(itemSchema).min(1),
});

export type QuickQuoteInput = z.input<typeof schema>;

export async function createQuickQuote(input: QuickQuoteInput) {
  const { user } = await requireQuotePermission("quotes.create");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  if (parsed.data.issue && !parsed.data.clientId)
    return { ok: false, errors: ["Sin cliente no se puede emitir."] };
  const products = await prisma.product.findMany({
    where: { id: { in: parsed.data.items.map((i) => i.productId) } },
    select: { id: true, normalizedName: true, brand: { select: { name: true } }, ivaPercent: true },
  });
  if (products.length !== new Set(parsed.data.items.map((i) => i.productId)).size)
    return { ok: false, errors: ["Hay productos que ya no existen."] };
  const byId = new Map(products.map((p) => [p.id, p]));
  const quote = await createQuoteShell({
    ownerId: user.id,
    clientId: parsed.data.clientId,
    reference: parsed.data.reference,
    contactName: parsed.data.contactName || null,
    layoutKey: parsed.data.layoutKey,
    profileKey: "resumido",
  });
  const alternative = quote.alternatives[0];
  const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
  await prisma.$transaction([
    prisma.quote.update({
      where: { id: quote.id },
      data: { currency: "USD", showDeliveryColumn: false },
    }),
    prisma.quoteCommercialTerms.update({
      where: { quoteId: quote.id },
      data: { validityDays: parsed.data.validityDays, pricesIn: "USD" },
    }),
    prisma.quoteItem.createMany({
      data: parsed.data.items.map((item, index) => {
        const product = byId.get(item.productId)!;
        const price = item.included ? 0 : item.unitPriceUsd * (1 - item.discountPercent / 100);
        return {
          quoteId: quote.id,
          alternativeId: alternative?.id,
          productId: item.productId,
          kind: "PRODUCT",
          quantity: new Prisma.Decimal(item.quantity),
          unit: "u",
          description: [product.brand?.name, product.normalizedName].filter(Boolean).join(" — "),
          unitPriceUsd: new Prisma.Decimal(price),
          lineTotalUsd: new Prisma.Decimal(price * item.quantity),
          priceOverridden: true,
          ivaRate: new Prisma.Decimal(
            product.ivaPercent == null ? defaultIva : Number(product.ivaPercent),
          ),
          source: "MANUAL",
          sortOrder: index,
          notes: item.note || (item.included ? "Incluido" : null),
        };
      }),
    }),
  ]);
  if (parsed.data.issue) {
    const fd = new FormData();
    fd.set("quoteId", quote.id);
    const issued = await issueQuote(fd);
    if (!issued.ok)
      return {
        ok: false,
        quoteId: quote.id,
        number: quote.number,
        errors: [issued.error || "No se pudo emitir."],
      };
  }
  const fresh = await prisma.quote.findUnique({
    where: { id: quote.id },
    select: { pdfBlobUrl: true },
  });
  return {
    ok: true,
    quoteId: quote.id,
    number: quote.number,
    pdfUrl: fresh?.pdfBlobUrl || undefined,
  };
}

export async function searchQuickQuoteProducts(query: string, clientId?: string | null) {
  await requireQuotePermission("quotes.create");
  if (query.trim().length < 2) return [];
  const q = query.trim();
  const found = await prisma.product.findMany({
    where: { isActive: true, ...buildProductSearchWhere(q) },
    take: 60,
    include: {
      brand: { select: { name: true } },
      accessories: {
        where: { kind: { in: ["INCLUDED", "ACCESSORY"] } },
        include: {
          accessoryProduct: { select: { id: true, normalizedName: true, internalSku: true } },
        },
      },
    },
  });
  const products = sortBySearchRelevance(found, q, (p) => ({
    normalizedName: p.normalizedName,
    originalName: p.originalName,
    internalSku: p.internalSku,
    supplierSku: p.supplierSku,
    modelNumber: p.modelNumber,
    manufacturerItem: p.manufacturerItem,
    brandName: p.brand?.name ?? null,
  })).slice(0, 20);
  const prices = await calculatePricesForProducts(
    products.map((p) => ({
      productId: p.id,
      baseCostUsd: Number(p.baseCostUsd),
      brandId: p.brandId,
      distributorId: p.distributorId,
      categoryId: p.categoryId,
      familyId: p.familyId,
      productDiscountPercent: p.discountPercent == null ? null : Number(p.discountPercent),
      tariffDutyPercent: p.tariffDutyPercent == null ? null : Number(p.tariffDutyPercent),
      coefNac: p.coefNac == null ? null : Number(p.coefNac),
      coefVta: p.coefVta == null ? null : Number(p.coefVta),
      coefVtaFob: p.coefVtaFob == null ? null : Number(p.coefVtaFob),
      ivaPercent: p.ivaPercent == null ? null : Number(p.ivaPercent),
      impIntPercent: p.impIntPercent == null ? null : Number(p.impIntPercent),
    })),
    clientId || null,
    await getGlobalMarginPercent(),
  );
  return products.map((p) => ({
    id: p.id,
    name: p.normalizedName,
    sku: p.internalSku,
    brand: p.brand?.name || null,
    stock: p.stockStatus,
    price: prices.get(p.id)?.finalPriceUsd ?? 0,
    accessories: p.accessories.map((a) => ({
      id: a.accessoryProduct.id,
      name: a.accessoryProduct.normalizedName,
      sku: a.accessoryProduct.internalSku,
      kind: a.kind,
    })),
  }));
}

export async function resolveQuickQuoteSkus(lines: string, clientId?: string | null) {
  await requireQuotePermission("quotes.create");
  const parsed = lines
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/[\t, ]+/);
      return { sku: parts[0], quantity: Math.max(1, Number(parts[1]) || 1) };
    });
  const found = await Promise.all(
    parsed.map(async (entry) => ({
      entry,
      matches: await searchQuickQuoteProducts(entry.sku, clientId),
    })),
  );
  return {
    items: found.flatMap(({ entry, matches }) => {
      const exact =
        matches.find((p) => p.sku?.toLowerCase() === entry.sku.toLowerCase()) || matches[0];
      return exact ? [{ ...exact, quantity: entry.quantity }] : [];
    }),
    missing: found.filter(({ matches }) => !matches.length).map(({ entry }) => entry.sku),
  };
}
