"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { Prisma, QuoteAssetKind, QuoteLayoutKey, QuoteNodeSource, QuoteSectionOrigin, QuoteStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireQuotePermission, loadQuoteForUser } from "@/lib/quote-access";
import { permissionsHave } from "@/lib/permissions";
import { allocateQuoteNumber, getQuoteNumberingConfig, QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import {
  ensureQuoteProfiles,
  moduleVersion,
  QUOTE_MODULES,
  resolveDefaultProfileId,
  resolveQuoteModuleBodies,
} from "@/lib/quote-defaults";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";
import { ensureQuoteCatalogImage } from "@/lib/quote-product-images";
import { getSetting, setSetting, getGlobalMarginPercent } from "@/lib/settings";
import { calculatePricesForProducts } from "@/lib/pricing";
import { storeQuoteBlob } from "@/server/actions/quote-images";
import { resolveCommercialClientId } from "@/lib/client-context";
import { fillMissingShortDescription } from "@/lib/product-short-description";
import { applyQuoteClassifierPicks, readClassifierPicksFromForm } from "@/server/actions/quote-classifiers";

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

type QuoteShellInput = {
  ownerId: string;
  clientId?: string | null;
  reference?: string | null;
  contactName?: string | null;
  brief?: string | null;
  projectType?: string | null;
  layoutKey?: QuoteLayoutKey;
  profileKey?: string | null;
  alternativesEnabled?: boolean;
  notes?: string | null;
  advancedIntake?: Prisma.InputJsonValue;
  sourceRequestId?: string | null;
  revisionSummary?: string;
};

/** Crea el cascarón de una COT: número, plantilla fija, términos y alternativa default. */
async function createQuoteShell(input: QuoteShellInput) {
  await ensureQuoteProfiles();
  const profile =
    (input.profileKey
      ? await prisma.quoteContentProfile.findUnique({ where: { key: input.profileKey } })
      : null) ??
    (await prisma.quoteContentProfile.findUnique({
      where: { id: (await resolveDefaultProfileId()) || "" },
    }));

  const number = await allocateQuoteNumber();
  const layoutSetting = await getSetting(QUOTE_SETTING_KEYS.defaultLayout, "STANDARD");
  const layoutKey =
    input.layoutKey ||
    (layoutSetting === "COMPACT" || layoutSetting === "EDITORIAL" ? layoutSetting : "STANDARD");
  const showDelivery = (await getSetting(QUOTE_SETTING_KEYS.showDeliveryDefault, "true")) !== "false";
  const terms = await defaultTerms();
  const enabled = new Set(
    Array.isArray(profile?.sectionKeys)
      ? (profile!.sectionKeys as string[])
      : QUOTE_MODULES.filter((m) => m.defaultOn.includes("tecnico")).map((m) => m.key)
  );
  const bodies = await resolveQuoteModuleBodies();

  return prisma.quote.create({
    data: {
      number,
      ownerId: input.ownerId,
      clientId: input.clientId || null,
      reference: input.reference || input.projectType || null,
      contactName: input.contactName || null,
      layoutKey,
      contentProfileId: profile?.id ?? null,
      alternativesEnabled: Boolean(input.alternativesEnabled),
      showDeliveryColumn: showDelivery,
      projectType: input.projectType || null,
      brief: input.brief || null,
      advancedIntake: input.advancedIntake ?? undefined,
      ...(input.sourceRequestId ? { sourceRequestId: input.sourceRequestId } : {}),
      alternatives: {
        create: { key: "default", name: "Solución", isDefault: true, sortOrder: 0 },
      },
      context: {
        create: {
          notes: input.notes || null,
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
          sourceBlockVersion: moduleVersion(mod),
        })),
      },
      revisions: {
        create: { actorId: input.ownerId, summary: input.revisionSummary || `Alta ${number}` },
      },
    },
    include: { alternatives: true },
  });
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

  const quote = await createQuoteShell({
    ownerId: user.id,
    clientId: parsed.data.clientId || null,
    reference: parsed.data.reference || parsed.data.projectType || null,
    contactName: parsed.data.contactName || null,
    brief: parsed.data.brief || null,
    projectType: parsed.data.projectType || null,
    layoutKey: parsed.data.layoutKey,
    profileKey: parsed.data.profileKey || null,
    alternativesEnabled: parsed.data.alternativesEnabled === "on" || parsed.data.alternativesEnabled === "true",
    notes: parsed.data.notes || null,
    advancedIntake: {
      notes: parsed.data.notes,
      areaM2: parsed.data.areaM2,
      people: parsed.data.people,
      budgetUsd: parsed.data.budgetUsd,
      brandPref: parsed.data.brandPref,
      brandAvoid: parsed.data.brandAvoid,
    },
    revisionSummary: undefined,
  });

  const { picks } = await readClassifierPicksFromForm(formData);
  await applyQuoteClassifierPicks(quote.id, picks);

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
  if (brief.length >= 12 || Object.keys(picks).length > 0) {
    redirect(`/admin/quotes/${quote.id}?paso=2&autogen=1`);
  }
  redirect(`/admin/quotes/${quote.id}?paso=1`);
}

const REQUEST_TYPE_PROJECT: Record<string, string> = {
  QUOTE: "audio_comercial",
  ORDER: "audio_comercial",
  CONSULTATION: "otro",
};

function buildRequestBrief(input: {
  shortId: string;
  typeLabel: string;
  clientName: string;
  projectDescription: string | null;
  items: Array<{ name: string; isAdminSuggestion: boolean }>;
}) {
  const names = [...new Set(input.items.map((i) => i.name).filter(Boolean))];
  const problem =
    input.projectDescription?.trim() ||
    `Pedido de ${input.typeLabel.toLowerCase()} de ${input.clientName}.`;
  const parts = [`Qué hay que resolver:\n${problem}`];
  if (names.length) {
    parts.push(`Productos:\n${names.map((name) => `- ${name}`).join("\n")}`);
  }
  return parts.join("\n\n").slice(0, 4000);
}

async function resolveClientIdForRequestQuote(request: {
  id: string;
  clientId: string | null;
  userId: string;
  user: {
    clientId: string | null;
    companyName: string | null;
    email: string | null;
    name: string | null;
  };
}) {
  const candidates = [request.clientId, request.user.clientId, await resolveCommercialClientId(request.userId)].filter(
    (id): id is string => Boolean(id)
  );

  for (const id of candidates) {
    const client = await prisma.client.findUnique({ where: { id }, select: { id: true } });
    if (client) {
      await backfillRequestClient(request, client.id);
      return client.id;
    }
  }

  const companyName = request.user.companyName?.trim();
  if (companyName) {
    const byName = await prisma.client.findFirst({
      where: { companyName: { equals: companyName, mode: "insensitive" } },
      select: { id: true },
    });
    if (byName) {
      await backfillRequestClient(request, byName.id);
      return byName.id;
    }
  }

  const created = await prisma.client.create({
    data: {
      companyName: companyName || request.user.name || request.user.email || "Cliente",
      contactName: request.user.name || null,
      email: request.user.email || null,
    },
  });
  await backfillRequestClient(request, created.id);
  return created.id;
}

async function backfillRequestClient(
  request: { id: string; clientId: string | null; userId: string; user: { clientId: string | null } },
  clientId: string
) {
  if (!request.clientId) {
    await prisma.customerRequest.update({ where: { id: request.id }, data: { clientId } });
  }
  if (!request.user.clientId) {
    await prisma.user.update({ where: { id: request.userId }, data: { clientId } });
  }
}

/**
 * Arma un borrador de COT a partir de una solicitud:
 * productos (con reemplazos resueltos), plantilla fija y brief para que la IA
 * complete textos / accesorios sin pisar lo que ya acordamos.
 */
function isMissingColumnError(error: unknown, column: string) {
  const message = error instanceof Error ? error.message : String(error);
  const code =
    typeof error === "object" && error && "code" in error ? String((error as { code: unknown }).code) : "";
  return (
    code === "P2022" ||
    (message.includes(column) && /does not exist|Unknown argument|Unknown field|column/i.test(message))
  );
}

function createQuoteErrorMessage(error: unknown) {
  if (isMissingColumnError(error, "sourceRequestId")) {
    return "Falta la columna sourceRequestId en la base. Corré `npx prisma db push` y reintentá.";
  }
  if (error instanceof Error && error.message.trim()) {
    const compact = error.message.replace(/\s+/g, " ").slice(0, 220);
    return `No se pudo crear la cotización: ${compact}`;
  }
  return "No se pudo crear la cotización.";
}

export async function createQuoteFromRequest(input: {
  requestId: string;
  fillAiTexts?: boolean;
}): Promise<{ ok: boolean; error?: string; quoteId?: string; quoteNumber?: string; fillAiTexts?: boolean }> {
  const { user, permissions } = await requireQuotePermission("quotes.create");
  if (!permissionsHave(permissions, "quotes.create") && !permissions.fullAccess) {
    return { ok: false, error: "No tenés permiso para crear cotizaciones." };
  }

  try {
    const request = await prisma.customerRequest.findUnique({
      where: { id: input.requestId },
      include: {
        user: { select: { name: true, companyName: true, email: true, clientId: true } },
        items: {
          include: { product: { include: { brand: true } } },
          orderBy: { createdAt: "asc" },
        },
        messages: {
          include: { sender: { select: { name: true, role: true } } },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!request) return { ok: false, error: "La solicitud ya no existe." };

    const clientId = await resolveClientIdForRequestQuote(request);
    const clientName = request.user.companyName || request.user.name || request.user.email || "Cliente";
    const shortId = request.id.slice(-6).toUpperCase();
    const typeLabel =
      request.type === "ORDER" ? "Pedido" : request.type === "CONSULTATION" ? "Consulta" : "Cotización";

    const nameByProductId = new Map(request.items.map((i) => [i.product.id, i.product.normalizedName]));
    const replacedProductIds = new Set(
      request.items
        .filter((i) => i.isAdminSuggestion && i.adminAlternativeProductId)
        .map((i) => i.adminAlternativeProductId as string)
    );

    const briefItems = request.items.map((i) => ({
      quantity: i.quantity,
      name: i.product.normalizedName,
      isAdminSuggestion: i.isAdminSuggestion,
      replacesName: i.adminAlternativeProductId ? nameByProductId.get(i.adminAlternativeProductId) ?? null : null,
      notes: i.adminNotes || i.userNotes,
    }));

    const brief = buildRequestBrief({
      shortId,
      typeLabel,
      clientName,
      projectDescription: request.projectDescription,
      items: briefItems,
    });

    const shellInput = {
      ownerId: user.id,
      clientId,
      reference: request.projectDescription?.trim().slice(0, 80) || `Solicitud #${shortId}`,
      contactName: request.user.name || null,
      brief,
      projectType: REQUEST_TYPE_PROJECT[request.type] || null,
      notes: `Generada desde la solicitud #${shortId}.`,
      advancedIntake: { source: "customer_request", requestId: request.id },
      revisionSummary: `Alta desde solicitud #${shortId}`,
    };

    let quote;
    try {
      quote = await createQuoteShell({ ...shellInput, sourceRequestId: request.id });
    } catch (error) {
      if (!isMissingColumnError(error, "sourceRequestId")) throw error;
      quote = await createQuoteShell(shellInput);
    }

    const altId = quote.alternatives.find((a) => a.isDefault)?.id ?? quote.alternatives[0]?.id;
    const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
    const global = await getGlobalMarginPercent();
    const prices = await calculatePricesForProducts(
      request.items.map((i) => ({
        productId: i.product.id,
        baseCostUsd: Number(i.product.baseCostUsd),
        brandId: i.product.brandId,
        distributorId: i.product.distributorId,
        categoryId: i.product.categoryId,
        familyId: i.product.familyId,
        productDiscountPercent: i.product.discountPercent != null ? Number(i.product.discountPercent) : null,
        tariffDutyPercent: i.product.tariffDutyPercent != null ? Number(i.product.tariffDutyPercent) : null,
      })),
      clientId,
      global
    );

    let sort = 0;
    for (const item of request.items) {
      const replaced = !item.isAdminSuggestion && replacedProductIds.has(item.product.id);
      const unit = prices.get(item.product.id)?.finalPriceUsd ?? Number(item.product.salePriceUsd ?? 0);
      const qty = item.quantity;
      const desc = [item.product.brand?.name, item.product.normalizedName].filter(Boolean).join(" — ");
      const replacesName = item.adminAlternativeProductId
        ? nameByProductId.get(item.adminAlternativeProductId) ?? null
        : null;
      const notes = [
        item.isAdminSuggestion ? "Sugerencia del equipo" : null,
        replacesName ? `En reemplazo de ${replacesName}` : null,
        replaced ? "El cliente lo pidió; el equipo propuso una alternativa." : null,
        item.adminNotes || item.userNotes,
      ]
        .filter(Boolean)
        .join(" ");

      try {
        await prisma.quoteItem.create({
          data: {
            quoteId: quote.id,
            alternativeId: altId,
            kind: "PRODUCT",
            productId: item.product.id,
            quantity: new Prisma.Decimal(qty),
            unit: "u",
            description: desc,
            unitPriceUsd: new Prisma.Decimal(Number.isFinite(unit) ? unit : 0),
            lineTotalUsd: new Prisma.Decimal(Number.isFinite(unit) ? unit * qty : 0),
            ivaRate: new Prisma.Decimal(item.product.ivaPercent != null ? Number(item.product.ivaPercent) : defaultIva),
            optional: replaced,
            notes: notes || null,
            source: QuoteNodeSource.BRIEF,
            locked: false,
            sortOrder: sort,
          },
        });
        await ensureQuoteCatalogImage({ quoteId: quote.id, productId: item.product.id, caption: desc });
      } catch (error) {
        console.error("[createQuoteFromRequest] ítem no copiado", item.product.id, error);
      }
      sort += 1;
    }

    revalidatePath("/admin/quotes");
    revalidatePath(`/admin/quotes/${quote.id}`);
    revalidatePath(`/admin/requests/${request.id}`);
    return {
      ok: true,
      quoteId: quote.id,
      quoteNumber: quote.number,
      fillAiTexts: Boolean(input.fillAiTexts),
    };
  } catch (error) {
    console.error("[createQuoteFromRequest]", error);
    return { ok: false, error: createQuoteErrorMessage(error) };
  }
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
  const groupId = String(formData.get("groupId") || "").trim() || null;
  await prisma.quoteItem.create({
    data: {
      quoteId,
      groupId,
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
  try {
    await fillMissingShortDescription(product.id);
  } catch {
    /* la planilla se completa igual */
  }
  revalidatePath(`/admin/quotes/${quoteId}`);
  return { ok: true };
}

export async function addQuoteAccessory(formData: FormData): Promise<void> {
  await addProductToQuote(formData);
}

/** Edición humana de un ítem. El candado sólo le dice a la IA que no lo pise. */
export async function updateQuoteItem(formData: FormData): Promise<void> {
  await requireQuotePermission("quotes.edit");
  const id = String(formData.get("itemId") || "");
  const item = await prisma.quoteItem.findUnique({ include: { quote: true }, where: { id } });
  if (!item) return;
  const loaded = await loadQuoteForUser(item.quoteId);
  if (!loaded.quote) return;
  if (loaded.quote.status === "ISSUED") return;

  const quantity = Number(formData.get("quantity") ?? item.quantity);
  const description = String(formData.get("description") ?? item.description);
  const unit = String(formData.get("unit") ?? item.unit).trim() || item.unit;
  const deliveryKey = String(formData.get("deliveryKey") || "") || null;
  const ivaRate = Number(formData.get("ivaRate") ?? item.ivaRate);
  const unitPrice = Number(formData.get("unitPriceUsd") ?? item.unitPriceUsd);
  const overridden = formData.has("unitPriceUsd");

  await prisma.quoteItem.update({
    where: { id },
    data: {
      quantity: new Prisma.Decimal(quantity),
      unit,
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
  if (!item) return;
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
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote || loaded.quote.status === "ISSUED") return;
  await prisma.quoteSection.update({
    where: { id },
    data: { body: sanitizeQuoteHtml(body), source: QuoteNodeSource.MANUAL, stale: false },
  });
  revalidatePath(`/admin/quotes/${section.quoteId}`);
}

/** Edición humana de un módulo. El candado sólo le dice a la IA que no lo reescriba. */
export async function saveQuoteSectionBody(input: {
  sectionId: string;
  body: string;
  title?: string;
}): Promise<{ ok: boolean; error?: string }> {
  await requireQuotePermission("quotes.edit");
  const section = await prisma.quoteSection.findUnique({ where: { id: input.sectionId } });
  if (!section) return { ok: false, error: "El módulo ya no existe." };
  const loaded = await loadQuoteForUser(section.quoteId);
  if (!loaded.quote) return { ok: false, error: "Sin acceso a esta cotización." };
  if (loaded.quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida." };
  const title = (input.title || "").trim();
  await prisma.quoteSection.update({
    where: { id: section.id },
    data: {
      body: sanitizeQuoteHtml(input.body),
      ...(title ? { title } : {}),
      source: QuoteNodeSource.MANUAL,
      stale: false,
    },
  });
  revalidatePath(`/admin/quotes/${section.quoteId}`);
  return { ok: true };
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
  revalidatePath("/admin/settings/quotes");
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
  revalidatePath("/admin/settings/quotes");
}

/**
 * Guarda un módulo desde el editor visual. Cambia la plantilla, o sea todas las
 * cotizaciones futuras: las ya creadas conservan su texto.
 */
export async function saveQuoteTemplateBlock(input: {
  blockId: string;
  title?: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return { ok: false, error: "No tenés permiso para editar la plantilla." };
  }
  if (!input.blockId) return { ok: false, error: "Módulo inválido." };
  const title = (input.title || "").trim();
  await prisma.quoteBlock.update({
    where: { id: input.blockId },
    data: {
      ...(title ? { title } : {}),
      body: sanitizeQuoteHtml(input.body),
    },
  });
  revalidatePath("/admin/settings/quotes/plantilla");
  revalidatePath("/admin/settings/quotes");
  return { ok: true };
}

export async function saveQuoteImagePlacement(input: {
  target: "brands" | "iso";
  width: number;
  align: "left" | "center" | "right";
}): Promise<{ ok: boolean; error?: string }> {
  const { permissions } = await requireQuotePermission("quotes.manage_library");
  if (!permissions.fullAccess && !permissionsHave(permissions, "quotes.manage_library")) {
    return { ok: false, error: "No tenés permiso para editar la plantilla." };
  }
  const width = Math.min(100, Math.max(10, Math.round(input.width)));
  const align = input.align === "left" || input.align === "right" ? input.align : "center";
  const keys =
    input.target === "brands"
      ? [QUOTE_SETTING_KEYS.brandsWidth, QUOTE_SETTING_KEYS.brandsAlign]
      : [QUOTE_SETTING_KEYS.isoWidth, QUOTE_SETTING_KEYS.isoAlign];
  await setSetting(keys[0], String(width), { description: "Ancho de imagen en la cotización" });
  await setSetting(keys[1], align, { description: "Alineación de imagen en la cotización" });
  revalidatePath("/admin/settings/quotes/plantilla");
  revalidatePath("/admin/settings/quotes");
  return { ok: true };
}

