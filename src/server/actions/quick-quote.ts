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
import { productSubtitle, productTitle, tangoCode } from "@/lib/product-display";

const itemSchema = z.object({
  productId: z.string(),
  quantity: z.number().int("La cantidad tiene que ser un número entero.").positive(),
  unitPriceUsd: z.number().min(0),
  discountPercent: z.number().min(0).max(100).default(0),
  note: z.string().max(1000).default(""),
  included: z.boolean().default(false),
});
/**
 * El diseño elegido define cuánto contenido lleva el PDF. Antes la rápida
 * armaba siempre una carta corta, así que elegir "Estándar" o "Editorial" no
 * cambiaba nada: salía el mismo documento de una carilla.
 */
const LAYOUT_BY_PROFILE = {
  resumido: "COMPACT",
  tecnico: "STANDARD",
  premium: "EDITORIAL",
} as const;

const schema = z.object({
  clientId: z.string().nullable(),
  /** Cliente escrito a mano, sin alta. */
  clientName: z.string().max(200).default(""),
  contactName: z.string().max(160).default(""),
  reference: z.string().min(1).max(200),
  /** Tipo de documento: qué módulos lleva el PDF. */
  profileKey: z.enum(["resumido", "tecnico", "premium"]).default("resumido"),
  taxMode: z.enum(["NOTE", "NONE", "ADDED"]).default("NOTE"),
  validityDays: z.number().int().min(1).max(365),
  issue: z.boolean(),
  items: z.array(itemSchema).min(1),
});

export type QuickQuoteInput = z.input<typeof schema>;

export async function createQuickQuote(input: QuickQuoteInput) {
  const { user } = await requireQuotePermission("quotes.create");
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, errors: parsed.error.issues.map((i) => i.message) };
  if (parsed.data.issue && !parsed.data.clientId && !parsed.data.clientName.trim())
    return { ok: false, errors: ["Elegí un cliente o escribí su nombre para emitir."] };
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
    clientName: parsed.data.clientName.trim() || null,
    reference: parsed.data.reference,
    contactName: parsed.data.contactName || null,
    layoutKey: LAYOUT_BY_PROFILE[parsed.data.profileKey],
    profileKey: parsed.data.profileKey,
    taxMode: parsed.data.taxMode,
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
          // La segunda línea de la descripción sale en el editor y en el PDF: así el «sin cargo» se ve.
          description: [
            [product.brand?.name, product.normalizedName].filter(Boolean).join(" — "),
            item.included ? `Incluido sin cargo${item.note ? ` (${item.note.replace(/^Incluido\s*/i, "")})` : ""}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
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
          accessoryProduct: { select: { id: true, normalizedName: true, internalSku: true, ivaPercent: true } },
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
      familia: p.familia ?? null,
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
    name: productTitle(p),
    /** Descripción debajo del modelo (misma regla que el catálogo). */
    subtitle: productSubtitle(p),
    sku: p.internalSku,
    tango: tangoCode(p.internalSku),
    brand: p.brand?.name || null,
    stock: p.stockStatus,
    price: prices.get(p.id)?.finalPriceUsd ?? 0,
    ivaPercent: p.ivaPercent == null ? null : Number(p.ivaPercent),
    accessories: p.accessories.map((a) => ({
      id: a.accessoryProduct.id,
      name: a.accessoryProduct.normalizedName,
      sku: a.accessoryProduct.internalSku,
      kind: a.kind,
      ivaPercent: a.accessoryProduct.ivaPercent == null ? null : Number(a.accessoryProduct.ivaPercent),
      /** Unidades incluidas por cada unidad del producto (ficha); 1 si no está cargado. */
      quantity: a.quantity && a.quantity > 0 ? a.quantity : 1,
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
      return { sku: parts[0], quantity: Math.max(1, Math.round(Number(parts[1]) || 1)) };
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
