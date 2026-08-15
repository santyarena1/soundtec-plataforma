"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, QuoteAssetKind, QuoteLayoutKey, QuoteNodeSource, QuoteSectionOrigin, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission, loadQuoteForUser } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { allocateQuoteNumber, getQuoteNumberingConfig, QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { ensureQuoteProfiles, QUOTE_MODULES, resolveDefaultProfileId, resolveQuoteModuleBodies } from "@/lib/quote-defaults";
import { ensureQuoteCatalogImage } from "@/lib/quote-product-images";
import { getSetting, setSetting, getGlobalMarginPercent } from "@/lib/settings";
import { calculatePricesForProducts } from "@/lib/pricing";
import { storeQuoteBlob } from "@/server/actions/quote-images";

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
  const enabled = new Set(
    Array.isArray(profile?.sectionKeys)
      ? (profile!.sectionKeys as string[])
      : QUOTE_MODULES.filter((m) => m.defaultOn.includes("tecnico")).map((m) => m.key)
  );
  const bodies = await resolveQuoteModuleBodies();

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
        create: QUOTE_MODULES.map((mod, i) => ({
          type: mod.key,
          title: mod.title,
          body: bodies[mod.key] || mod.body,
          origin:
            mod.kind === "fixed"
              ? QuoteSectionOrigin.CORPORATE
              : mod.kind === "table"
                ? QuoteSectionOrigin.TEMPLATE
                : QuoteSectionOrigin.PROJECT,
          source: QuoteNodeSource.TEMPLATE,
          locked: mod.kind === "fixed",
          included: enabled.has(mod.key),
          sortOrder: i,
          sourceBlockKey: mod.key,
          sourceBlockVersion: 1,
        })),
      },
      revisions: {
        create: { actorId: user.id, summary: `Alta ${number}` },
      },
    },
  });

  const planFiles = formData.getAll("plans");
  let planSort = 0;
  for (const file of planFiles) {
    if (!(file instanceof File) || file.size === 0) continue;
    const stored = await storeQuoteBlob(
      `quotes/${quote.id}/plan-${Date.now()}-${file.name}`,
      await file.arrayBuffer(),
      file.type || "application/octet-stream"
    );
    if (!stored) continue;
    await prisma.quoteAsset.create({
      data: {
        quoteId: quote.id,
        kind: QuoteAssetKind.PLAN,
        url: stored,
        caption: file.name,
        aiGenerated: false,
        source: QuoteNodeSource.MANUAL,
        sortOrder: planSort,
      },
    });
    planSort += 1;
  }

  revalidatePath("/admin/quotes");
  const brief = (parsed.data.brief || "").trim();
  if (brief.length >= 12) {
    redirect(`/admin/quotes/${quote.id}?paso=2&autogen=1`);
  }
  redirect(`/admin/quotes/${quote.id}?paso=2`);
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
  await ensureQuoteCatalogImage({ quoteId, productId: product.id, caption: desc });
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function addQuoteAccessory(formData: FormData): Promise<void> {
  await addProductToQuote(formData);
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

export async function toggleQuoteItemOptional(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("itemId") || "");
  const item = await prisma.quoteItem.findUnique({ where: { id } });
  if (!item) return;
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  await prisma.quoteItem.update({ where: { id }, data: { optional: !item.optional } });
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
  const isHeader = formData.get("metaKind") === "header";
  await prisma.quote.update({
    where: { id },
    data: {
      ...(formData.has("reference") ? { reference: String(formData.get("reference") || "") || null } : {}),
      ...(formData.has("contactName") ? { contactName: String(formData.get("contactName") || "") || null } : {}),
      ...(formData.has("clientId") ? { clientId: String(formData.get("clientId") || "") || null } : {}),
      ...(formData.has("brief") ? { brief: String(formData.get("brief") || "") || null } : {}),
      layoutKey,
      ...(isHeader
        ? {
            alternativesEnabled: formData.get("alternativesEnabled") === "on",
            showDeliveryColumn: formData.get("showDeliveryColumn") === "on",
          }
        : {}),
    },
  });
  revalidatePath(`/admin/quotes/${id}`);
  if (isHeader) redirect(`/admin/quotes/${id}?paso=2`);
}

export async function saveQuoteTerms(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  const sourceRaw = String(formData.get("termsSource") || "SYSTEM");
  const termsSource = sourceRaw === "CLIENT_PREVIOUS" || sourceRaw === "CUSTOM" ? sourceRaw : "SYSTEM";
  await prisma.quote.update({
    where: { id },
    data: { termsSource },
  });
  await prisma.quoteCommercialTerms.upsert({
    where: { quoteId: id },
    create: {
      quoteId: id,
      paymentTerms: String(formData.get("paymentTerms") || "") || null,
      paymentReference: String(formData.get("paymentReference") || "") || null,
      deliveryText: String(formData.get("deliveryText") || "") || null,
      validityDays: Number(formData.get("validityDays") || "5") || 5,
      productWarranty: String(formData.get("productWarranty") || "") || null,
    },
    update: {
      paymentTerms: String(formData.get("paymentTerms") || "") || null,
      paymentReference: String(formData.get("paymentReference") || "") || null,
      deliveryText: String(formData.get("deliveryText") || "") || null,
      validityDays: Number(formData.get("validityDays") || "5") || 5,
      productWarranty: String(formData.get("productWarranty") || "") || null,
    },
  });
  revalidatePath(`/admin/quotes/${id}`);
}

export async function toggleQuoteModule(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("sectionId") || "");
  const section = await prisma.quoteSection.findUnique({ where: { id } });
  if (!section) return;
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  if (section.type === "products_table") return;
  await prisma.quoteSection.update({
    where: { id },
    data: { included: !section.included },
  });
  revalidatePath(`/admin/quotes/${section.quoteId}`);
}

export async function previewQuoteNumber(): Promise<string> {
  await requireQuotePermission("quotes.create");
  const cfg = await getQuoteNumberingConfig();
  return (await import("@/lib/quote-settings")).formatQuoteNumber({ ...cfg, sequence: cfg.nextSequence });
}

const QUOTE_STATUSES = new Set<QuoteStatus>([
  "DRAFT",
  "IN_REVIEW",
  "READY",
  "ISSUED",
  "SUPERSEDED",
  "ARCHIVED",
]);

export async function setQuoteStatus(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("quoteId") || "");
  const statusRaw = String(formData.get("status") || "");
  if (!QUOTE_STATUSES.has(statusRaw as QuoteStatus)) return { ok: false, error: "Estado inválido." };
  const status = statusRaw as QuoteStatus;
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };

  if (status === "ISSUED") {
    if (!permissionsHave(loaded.permissions, "quotes.issue") && !loaded.permissions.fullAccess) {
      return { ok: false, error: "Sin permiso para emitir." };
    }
    if (!loaded.quote.clientId) return { ok: false, error: "Asigná un cliente antes de emitir." };
    if (loaded.quote.items.length === 0) return { ok: false, error: "Agregá al menos un ítem." };
    if (loaded.quote.showDeliveryColumn && loaded.quote.items.some((i) => !i.deliveryKey && !i.excluded)) {
      return { ok: false, error: "Completá la entrega en todas las filas (o desactivá la columna)." };
    }
  }

  await prisma.quote.update({
    where: { id },
    data: {
      status,
      issuedAt: status === "ISSUED" ? loaded.quote.issuedAt ?? new Date() : status === "DRAFT" ? null : loaded.quote.issuedAt,
      issuedById:
        status === "ISSUED"
          ? loaded.quote.issuedById ?? loaded.user.id
          : status === "DRAFT"
            ? null
            : loaded.quote.issuedById,
    },
  });
  await prisma.quoteRevision.create({
    data: { quoteId: id, actorId: loaded.user.id, summary: `Estado: ${loaded.quote.status} → ${status}` },
  });
  revalidatePath("/admin/quotes");
  revalidatePath(`/admin/quotes/${id}`);
  return { ok: true };
}

export async function deleteQuote(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return { ok: false, error: "Sin acceso." };
  await prisma.quote.delete({ where: { id } });
  revalidatePath("/admin/quotes");
  return { ok: true };
}

export async function saveQuoteSignature(formData: FormData): Promise<void> {
  const { user } = await requireQuotePermission("quotes.edit");
  await prisma.user.update({
    where: { id: user.id },
    data: {
      quoteSignName: String(formData.get("quoteSignName") || "").trim() || null,
      quoteSignTitle: String(formData.get("quoteSignTitle") || "").trim() || null,
    },
  });
  const quoteId = String(formData.get("quoteId") || "");
  if (quoteId) revalidatePath(`/admin/quotes/${quoteId}`);
}

export async function duplicateQuote(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.create");
  const id = String(formData.get("quoteId") || "");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return;
  const src = await prisma.quote.findUnique({
    where: { id },
    include: {
      alternatives: true,
      items: true,
      sections: true,
      assets: true,
      context: true,
      terms: true,
    },
  });
  if (!src) return;
  const number = await allocateQuoteNumber();
  const created = await prisma.quote.create({
    data: {
      number,
      ownerId: loaded.user.id,
      clientId: src.clientId,
      reference: src.reference ? `${src.reference} (copia)` : src.number,
      contactName: src.contactName,
      layoutKey: src.layoutKey,
      contentProfileId: src.contentProfileId,
      alternativesEnabled: src.alternativesEnabled,
      showDeliveryColumn: src.showDeliveryColumn,
      projectType: src.projectType,
      brief: src.brief,
      advancedIntake: src.advancedIntake ?? undefined,
      status: "DRAFT",
      termsSource: src.termsSource,
    },
  });
  const altMap = new Map<string, string>();
  for (const alt of src.alternatives) {
    const n = await prisma.quoteAlternative.create({
      data: {
        quoteId: created.id,
        key: alt.key,
        name: alt.name,
        purpose: alt.purpose,
        isDefault: alt.isDefault,
        sortOrder: alt.sortOrder,
      },
    });
    altMap.set(alt.id, n.id);
  }
  for (const item of src.items) {
    await prisma.quoteItem.create({
      data: {
        quoteId: created.id,
        alternativeId: item.alternativeId ? altMap.get(item.alternativeId) ?? null : null,
        kind: item.kind,
        productId: item.productId,
        serviceType: item.serviceType,
        quantity: item.quantity,
        unit: item.unit,
        description: item.description,
        unitPriceUsd: item.unitPriceUsd,
        lineTotalUsd: item.lineTotalUsd,
        ivaRate: item.ivaRate,
        deliveryKey: item.deliveryKey,
        optional: item.optional,
        source: "MANUAL",
        sortOrder: item.sortOrder,
      },
    });
  }
  for (const section of src.sections) {
    await prisma.quoteSection.create({
      data: {
        quoteId: created.id,
        alternativeId: section.alternativeId ? altMap.get(section.alternativeId) ?? null : null,
        type: section.type,
        title: section.title,
        body: section.body,
        origin: section.origin,
        source: section.source,
        locked: section.locked,
        included: section.included,
        sortOrder: section.sortOrder,
        sourceBlockKey: section.sourceBlockKey,
        sourceBlockVersion: section.sourceBlockVersion,
      },
    });
  }
  for (const asset of src.assets) {
    await prisma.quoteAsset.create({
      data: {
        quoteId: created.id,
        kind: asset.kind,
        url: asset.url,
        caption: asset.caption,
        aiGenerated: asset.aiGenerated,
        source: asset.source,
        productId: asset.productId,
        sortOrder: asset.sortOrder,
      },
    });
  }
  if (src.context) {
    await prisma.quoteContext.create({
      data: {
        quoteId: created.id,
        facts: src.context.facts ?? undefined,
        assumptions: src.context.assumptions ?? undefined,
        questions: src.context.questions ?? undefined,
        risks: src.context.risks ?? undefined,
        notes: src.context.notes,
      },
    });
  }
  if (src.terms) {
    await prisma.quoteCommercialTerms.create({
      data: {
        quoteId: created.id,
        pricesIn: src.terms.pricesIn,
        paymentReference: src.terms.paymentReference,
        paymentTerms: src.terms.paymentTerms,
        validityDays: src.terms.validityDays,
        deliveryText: src.terms.deliveryText,
        productWarranty: src.terms.productWarranty,
      },
    });
  }
  await prisma.quoteRevision.create({
    data: { quoteId: created.id, actorId: loaded.user.id, summary: `Copia de ${src.number}` },
  });
  revalidatePath("/admin/quotes");
  redirect(`/admin/quotes/${created.id}?paso=2`);
}

const QUOTE_CONFIG_KEYS = new Set<string>(
  Object.values(QUOTE_SETTING_KEYS).filter((k) => k.startsWith("quotes."))
);

export async function saveQuoteModuleSetting(formData: FormData): Promise<void> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) return;
  const key = String(formData.get("key") || "");
  const value = String(formData.get("value") || "");
  if (!QUOTE_CONFIG_KEYS.has(key)) return;
  await setSetting(key, value, { description: "Configuración del módulo de cotizaciones" });
  revalidatePath("/admin/quotes/config");
  revalidatePath("/admin/quotes");
}

export async function saveQuoteBlockTemplate(formData: FormData): Promise<void> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) return;
  const id = String(formData.get("blockId") || "");
  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "");
  if (!id) return;
  await prisma.quoteBlock.update({
    where: { id },
    data: {
      ...(title ? { title } : {}),
      body,
    },
  });
  revalidatePath("/admin/quotes/config");
}

