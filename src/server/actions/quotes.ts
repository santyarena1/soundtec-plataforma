"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, QuoteLayoutKey, QuoteNodeSource, QuoteSectionOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission, loadQuoteForUser } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { allocateQuoteNumber, getQuoteNumberingConfig, QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { ensureQuoteProfiles, LETTER_OPEN_TEMPLATE, resolveDefaultProfileId } from "@/lib/quote-defaults";
import { getSetting } from "@/lib/settings";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent } from "@/lib/settings";

const SECTION_TITLES: Record<string, string> = {
  letter_open: "Apertura",
  corporate_intro: "Presentación Soundtec",
  brands: "Marcas",
  proposal: "Nuestra propuesta",
  design_criteria: "Criterios de diseño",
  key_products: "Productos clave",
  functionality: "Funcionalidad e instalación",
  products_table: "Productos y servicios",
  installation: "Instalación del sistema",
  staff: "Personal técnico",
  commercial_terms: "Condiciones comerciales",
  warranty: "Garantía",
  iso: "Calidad certificada ISO 9001",
  closing: "Cierre",
};

async function defaultTerms() {
  return {
    pricesIn: "USD",
    paymentReference: await getSetting(
      QUOTE_SETTING_KEYS.paymentReference,
      "El pago podrá efectuarse en pesos argentinos, utilizando como referencia la cotización del tipo de cambio billete, tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura."
    ),
    paymentTerms: await getSetting(QUOTE_SETTING_KEYS.paymentTerms, "A CONVENIR."),
    validityDays: Number(await getSetting(QUOTE_SETTING_KEYS.validityDays, "5")) || 5,
    productWarranty: await getSetting(
      QUOTE_SETTING_KEYS.productWarranty,
      "Salvo indicación en contrario, todos los productos gozan de una garantía de 12 meses a partir de la fecha de facturación, contra vicios de fabricación."
    ),
    deliveryText: "El plazo de entrega será confirmado una vez recibida la orden de compra formal.",
  };
}

export async function createQuoteFromBrief(formData: FormData): Promise<void> {
  const { user, permissions } = await requireQuotePermission("quotes.create");
  if (!permissionsHave(permissions, "quotes.create") && !permissions.fullAccess) {
    redirect("/admin/quotes/new");
  }

  const parsed = z
    .object({
      clientId: z.string().optional(),
      reference: z.string().max(200).optional(),
      contactName: z.string().max(160).optional(),
      brief: z.string().max(20000).optional(),
      projectType: z.string().max(80).optional(),
      layoutKey: z.nativeEnum(QuoteLayoutKey).optional(),
      profileKey: z.string().max(40).optional(),
      alternativesEnabled: z.string().optional(),
      notes: z.string().max(4000).optional(),
      areaM2: z.string().optional(),
      people: z.string().optional(),
      budgetUsd: z.string().optional(),
      brandPref: z.string().optional(),
      brandAvoid: z.string().optional(),
    })
    .safeParse({
      clientId: String(formData.get("clientId") || "") || undefined,
      reference: String(formData.get("reference") || "") || undefined,
      contactName: String(formData.get("contactName") || "") || undefined,
      brief: String(formData.get("brief") || "") || undefined,
      projectType: String(formData.get("projectType") || "") || undefined,
      layoutKey: (String(formData.get("layoutKey") || "") || undefined) as QuoteLayoutKey | undefined,
      profileKey: String(formData.get("profileKey") || "") || undefined,
      alternativesEnabled: String(formData.get("alternativesEnabled") || ""),
      notes: String(formData.get("notes") || "") || undefined,
      areaM2: String(formData.get("areaM2") || "") || undefined,
      people: String(formData.get("people") || "") || undefined,
      budgetUsd: String(formData.get("budgetUsd") || "") || undefined,
      brandPref: String(formData.get("brandPref") || "") || undefined,
      brandAvoid: String(formData.get("brandAvoid") || "") || undefined,
    });

  if (!parsed.success) redirect("/admin/quotes/new");

  await ensureQuoteProfiles();
  const profile =
    (parsed.data.profileKey
      ? await prisma.quoteContentProfile.findUnique({ where: { key: parsed.data.profileKey } })
      : null) ??
    (await prisma.quoteContentProfile.findUnique({
      where: { id: (await resolveDefaultProfileId()) || "" },
    }));

  const number = await allocateQuoteNumber();
  const layoutSetting = await getSetting(QUOTE_SETTING_KEYS.defaultLayout, "STANDARD");
  const layoutKey =
    parsed.data.layoutKey ||
    (layoutSetting === "COMPACT" || layoutSetting === "EDITORIAL" ? layoutSetting : "STANDARD");
  const showDelivery = (await getSetting(QUOTE_SETTING_KEYS.showDeliveryDefault, "true")) !== "false";
  const terms = await defaultTerms();
  const sectionKeys = Array.isArray(profile?.sectionKeys) ? (profile!.sectionKeys as string[]) : ["letter_open", "products_table", "commercial_terms", "closing"];

  const quote = await prisma.quote.create({
    data: {
      number,
      ownerId: user.id,
      clientId: parsed.data.clientId || null,
      reference: parsed.data.reference || parsed.data.projectType || null,
      contactName: parsed.data.contactName || null,
      layoutKey,
      contentProfileId: profile?.id ?? null,
      alternativesEnabled: parsed.data.alternativesEnabled === "on" || parsed.data.alternativesEnabled === "true",
      showDeliveryColumn: showDelivery,
      projectType: parsed.data.projectType || null,
      brief: parsed.data.brief || null,
      advancedIntake: {
        notes: parsed.data.notes,
        areaM2: parsed.data.areaM2,
        people: parsed.data.people,
        budgetUsd: parsed.data.budgetUsd,
        brandPref: parsed.data.brandPref,
        brandAvoid: parsed.data.brandAvoid,
      },
      alternatives: {
        create: { key: "default", name: "Solución", isDefault: true, sortOrder: 0 },
      },
      context: {
        create: {
          notes: parsed.data.notes || null,
          facts: [],
          assumptions: [],
          questions: [],
          risks: [],
        },
      },
      terms: { create: terms },
      sections: {
        create: sectionKeys.map((type, i) => ({
          type,
          title: SECTION_TITLES[type] || type,
          body: type === "letter_open" ? LETTER_OPEN_TEMPLATE : "",
          origin: type.startsWith("corporate") || type === "iso" || type === "warranty" ? QuoteSectionOrigin.CORPORATE : QuoteSectionOrigin.PROJECT,
          source: QuoteNodeSource.TEMPLATE,
          sortOrder: i,
        })),
      },
      revisions: {
        create: { actorId: user.id, summary: `Alta ${number}` },
      },
    },
  });

  revalidatePath("/admin/quotes");
  redirect(`/admin/quotes/${quote.id}`);
}

export async function searchProductsForQuote(query: string) {
  await requireQuotePermission("quotes.edit");
  const q = query.trim();
  if (q.length < 2) return [];
  return prisma.product.findMany({
    where: {
      isActive: true,
      OR: [
        { normalizedName: { contains: q, mode: "insensitive" } },
        { originalName: { contains: q, mode: "insensitive" } },
        { internalSku: { contains: q, mode: "insensitive" } },
        { supplierSku: { contains: q, mode: "insensitive" } },
        { modelNumber: { contains: q, mode: "insensitive" } },
      ],
    },
    take: 20,
    select: {
      id: true,
      normalizedName: true,
      internalSku: true,
      supplierSku: true,
      modelNumber: true,
      brand: { select: { name: true } },
      ivaPercent: true,
    },
  });
}

export async function addProductToQuote(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const { permissions } = await requireQuotePermission("quotes.edit");
  if (!permissionsHave(permissions, "quotes.edit") && !permissions.fullAccess) {
    return { ok: false, error: "Sin permiso de edición." };
  }
  const quoteId = String(formData.get("quoteId") || "");
  const productId = String(formData.get("productId") || "");
  const qty = Number(formData.get("quantity") || "1") || 1;
  const loaded = await loadQuoteForUser(quoteId);
  if (!loaded.quote) return { ok: false, error: "Cotización no encontrada." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "Una COT emitida no se edita. Duplicá a una nueva versión." };

  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true },
  });
  if (!product) return { ok: false, error: "Producto no encontrado." };

  const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
  const iva = product.ivaPercent != null ? Number(product.ivaPercent) : defaultIva;
  let unit = 0;
  if (loaded.quote.clientId) {
    const global = await getGlobalMarginPercent();
    const prices = await calculatePricesForProducts(
      [
        {
          productId: product.id,
          baseCostUsd: Number(product.baseCostUsd),
          brandId: product.brandId,
          distributorId: product.distributorId,
          categoryId: product.categoryId,
          familyId: product.familyId,
          productDiscountPercent: product.discountPercent != null ? Number(product.discountPercent) : null,
          tariffDutyPercent: product.tariffDutyPercent != null ? Number(product.tariffDutyPercent) : null,
        },
      ],
      loaded.quote.clientId,
      global
    );
    unit = prices.get(product.id)?.finalPriceUsd ?? 0;
  } else {
    unit = Number(product.salePriceUsd ?? product.baseCostUsd ?? 0);
  }

  const maxSort = loaded.quote.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);
  const desc = [product.brand?.name, product.normalizedName].filter(Boolean).join(" — ");
  await prisma.quoteItem.create({
    data: {
      quoteId,
      alternativeId: loaded.quote.alternatives.find((a) => a.isDefault)?.id ?? loaded.quote.alternatives[0]?.id,
      kind: "PRODUCT",
      productId: product.id,
      quantity: new Prisma.Decimal(qty),
      unit: "u",
      description: desc,
      unitPriceUsd: new Prisma.Decimal(unit),
      lineTotalUsd: new Prisma.Decimal(unit * qty),
      ivaRate: new Prisma.Decimal(iva),
      source: QuoteNodeSource.CATALOG_SEARCH,
      sortOrder: maxSort + 1,
    },
  });
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function updateQuoteItem(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("itemId") || "");
  const item = await prisma.quoteItem.findUnique({ include: { quote: true }, where: { id } });
  if (!item) return;
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote) return;
  if (item.locked) return;
  if (loaded.quote.status === "ISSUED") return;

  const quantity = Number(formData.get("quantity") ?? item.quantity);
  const description = String(formData.get("description") ?? item.description);
  const deliveryKey = String(formData.get("deliveryKey") || "") || null;
  const ivaRate = Number(formData.get("ivaRate") ?? item.ivaRate);
  const unitPrice = Number(formData.get("unitPriceUsd") ?? item.unitPriceUsd);
  const overridden = formData.has("unitPriceUsd");

  await prisma.quoteItem.update({
    where: { id },
    data: {
      quantity: new Prisma.Decimal(quantity),
      description,
      deliveryKey,
      ivaRate: new Prisma.Decimal(ivaRate),
      unitPriceUsd: new Prisma.Decimal(unitPrice),
      lineTotalUsd: new Prisma.Decimal(unitPrice * quantity),
      priceOverridden: overridden || item.priceOverridden,
      source: QuoteNodeSource.MANUAL,
    },
  });
  revalidatePath(`/admin/quotes/${item.quoteId}`);
}

export async function toggleQuoteItemLock(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("itemId") || "");
  const item = await prisma.quoteItem.findUnique({ where: { id } });
  if (!item) return;
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote) return;
  await prisma.quoteItem.update({ where: { id }, data: { locked: !item.locked } });
  revalidatePath(`/admin/quotes/${item.quoteId}`);
}

export async function deleteQuoteItem(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("itemId") || "");
  const item = await prisma.quoteItem.findUnique({ where: { id } });
  if (!item || item.locked) return;
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  await prisma.quoteItem.delete({ where: { id } });
  revalidatePath(`/admin/quotes/${item.quoteId}`);
}

export async function updateQuoteSection(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("sectionId") || "");
  const body = String(formData.get("body") || "");
  const section = await prisma.quoteSection.findUnique({ where: { id } });
  if (!section) return;
  if (section.locked) return;
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote) return;
  await prisma.quoteSection.update({
    where: { id },
    data: { body, source: QuoteNodeSource.MANUAL, stale: false },
  });
  revalidatePath(`/admin/quotes/${section.quoteId}`);
}

export async function toggleQuoteSectionLock(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("sectionId") || "");
  const section = await prisma.quoteSection.findUnique({ where: { id } });
  if (!section) return;
  await prisma.quoteSection.update({ where: { id }, data: { locked: !section.locked } });
  revalidatePath(`/admin/quotes/${section.quoteId}`);
}

export async function saveQuoteMeta(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  const layoutRaw = String(formData.get("layoutKey") || loaded.quote.layoutKey);
  const layoutKey =
    layoutRaw === "COMPACT" || layoutRaw === "EDITORIAL" || layoutRaw === "STANDARD"
      ? layoutRaw
      : loaded.quote.layoutKey;
  await prisma.quote.update({
    where: { id },
    data: {
      reference: String(formData.get("reference") || "") || null,
      contactName: String(formData.get("contactName") || "") || null,
      clientId: String(formData.get("clientId") || "") || null,
      brief: String(formData.get("brief") || "") || null,
      layoutKey,
      alternativesEnabled: formData.get("alternativesEnabled") === "on",
      showDeliveryColumn: formData.get("showDeliveryColumn") === "on",
    },
  });
  revalidatePath(`/admin/quotes/${id}`);
}

export async function previewQuoteNumber(): Promise<string> {
  await requireQuotePermission("quotes.create");
  const cfg = await getQuoteNumberingConfig();
  return (await import("@/lib/quote-settings")).formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });
}
