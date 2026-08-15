import { Prisma, QuoteAiCapability, QuoteItemKind, QuoteNodeSource, QuoteSectionOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent, getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { AI_MODULE_KEYS } from "@/lib/quote-defaults";
import { fillMissingQuoteProductImages } from "@/lib/quote-product-images";
import { suggestHistoricalCompanions } from "@/server/actions/quote-history";
import { SOUNDTEC_VOICE, quoteChatJson, quoteChatText, getQuoteOpenAI, describeQuotePlanImage } from "@/lib/quote-llm";

type GenOut = {
  reference?: string;
  facts?: Array<{ text: string }>;
  assumptions?: Array<{ text: string }>;
  questions?: Array<{ text: string }>;
  risks?: Array<{ text: string }>;
  items?: Array<{
    search: string;
    quantity: number;
    rationale?: string;
    kind?: "PRODUCT" | "SERVICE";
    serviceType?: string;
  }>;
  sections?: Array<{ type: string; body: string }>;
};

async function catalogDigest(brief: string) {
  const tokens = brief
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
  const or =
    tokens.length === 0
      ? undefined
      : tokens.flatMap((t) => [
          { normalizedName: { contains: t, mode: "insensitive" as const } },
          { originalName: { contains: t, mode: "insensitive" as const } },
          { modelNumber: { contains: t, mode: "insensitive" as const } },
          { brand: { name: { contains: t, mode: "insensitive" as const } } },
        ]);
  const rows = await prisma.product.findMany({
    where: { isActive: true, ...(or ? { OR: or } : {}) },
    take: 80,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      normalizedName: true,
      internalSku: true,
      supplierSku: true,
      modelNumber: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
  if (rows.length >= 8) return rows;
  return prisma.product.findMany({
    where: { isActive: true },
    take: 80,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      normalizedName: true,
      internalSku: true,
      supplierSku: true,
      modelNumber: true,
      brand: { select: { name: true } },
      category: { select: { name: true } },
    },
  });
}

async function matchProduct(search: string) {
  const q = search.trim();
  if (q.length < 2) return null;
  const parts = q.split(/\s+/).filter((p) => p.length >= 2);
  const last = parts[parts.length - 1] || q;
  return prisma.product.findFirst({
    where: {
      isActive: true,
      OR: [
        { normalizedName: { contains: q, mode: "insensitive" } },
        { originalName: { contains: q, mode: "insensitive" } },
        { modelNumber: { contains: last, mode: "insensitive" } },
        { supplierSku: { contains: last, mode: "insensitive" } },
        { internalSku: { contains: last, mode: "insensitive" } },
        { brand: { name: { contains: parts[0], mode: "insensitive" } } },
      ],
    },
    include: { brand: true },
  });
}

export async function generateQuoteProposal(quoteId: string, userId: string) {
  const oa = await getQuoteOpenAI();
  if (!oa) {
    return { ok: false as const, error: "Cargá OpenAI API Key en Admin → API Keys." };
  }

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { items: true, sections: true, alternatives: true, context: true, client: true, assets: true },
  });
  if (!quote) return { ok: false as const, error: "Cotización no encontrada." };
  if (quote.status === "ISSUED") return { ok: false as const, error: "La COT emitida no se regenera." };

  const planNotes: string[] = [];
  for (const asset of quote.assets.filter((a) => a.kind === "PLAN" || a.kind === "PROJECT").slice(0, 4)) {
    try {
      const note = await describeQuotePlanImage(asset.url);
      if (note) planNotes.push(note);
    } catch {
      /* visión opcional */
    }
  }

  const brief = [
    quote.brief,
    quote.reference,
    quote.projectType,
    JSON.stringify(quote.advancedIntake || {}),
    planNotes.length ? `Lectura de planos:\n${planNotes.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (brief.replace(/\s/g, "").length < 12) {
    return { ok: false as const, error: "Escribí un brief antes de generar." };
  }

  const catalog = await catalogDigest(brief);
  const catalogText = catalog
    .map(
      (p) =>
        `- ${p.brand?.name || ""} ${p.normalizedName} | sku:${p.internalSku || p.supplierSku || p.modelNumber || p.id}`
    )
    .join("\n");

  const existing = quote.items
    .filter((i) => i.locked || i.source === "MANUAL")
    .map((i) => `${i.quantity} x ${i.description}`)
    .join("\n");

  const gen = await quoteChatJson<GenOut>(
    `${SOUNDTEC_VOICE}
Devolvé JSON con:
reference, facts[], assumptions[], questions[], risks[], items[], sections[].
items[].search debe coincidir con un producto del catálogo listado (marca + modelo). quantity número. kind PRODUCT o SERVICE.
sections[].type uno de: proposal, design_criteria, key_products, functionality.
No reescribas presentación, marcas, ISO, condiciones, garantía ni cierre: eso es plantilla fija.
No pongas precios. No inventes productos que no estén en el catálogo; si falta, omití.`,
    `Brief:\n${brief}\n\nÍtems que NO debés tocar:\n${existing || "(ninguno)"}\n\nCatálogo disponible:\n${catalogText || "(vacío)"}`
  );

  await prisma.quoteContext.upsert({
    where: { quoteId },
    create: {
      quoteId,
      facts: gen.facts || [],
      assumptions: gen.assumptions || [],
      questions: gen.questions || [],
      risks: gen.risks || [],
    },
    update: {
      facts: gen.facts || [],
      assumptions: gen.assumptions || [],
      questions: gen.questions || [],
      risks: gen.risks || [],
    },
  });

  if (gen.reference && !quote.reference) {
    await prisma.quote.update({ where: { id: quoteId }, data: { reference: gen.reference.slice(0, 200) } });
  }

  const altId = quote.alternatives.find((a) => a.isDefault)?.id ?? quote.alternatives[0]?.id;
  const defaultIva = Number(await getSetting(QUOTE_SETTING_KEYS.defaultIva, "21")) || 21;
  const global = await getGlobalMarginPercent();
  let sort = quote.items.reduce((m, i) => Math.max(m, i.sortOrder), -1);

  for (const row of gen.items || []) {
    const qty = Number(row.quantity) > 0 ? Number(row.quantity) : 1;
    if (row.kind === "SERVICE") {
      sort += 1;
      await prisma.quoteItem.create({
        data: {
          quoteId,
          alternativeId: altId,
          kind: QuoteItemKind.SERVICE,
          serviceType: row.serviceType || "instalacion",
          quantity: new Prisma.Decimal(qty),
          unit: "u",
          description: row.search,
          unitPriceUsd: new Prisma.Decimal(0),
          lineTotalUsd: new Prisma.Decimal(0),
          ivaRate: new Prisma.Decimal(defaultIva),
          source: QuoteNodeSource.SUGGESTED,
          quantityRationale: row.rationale,
          sortOrder: sort,
        },
      });
      continue;
    }
    const product = await matchProduct(row.search);
    if (!product) continue;
    if (quote.items.some((i) => i.productId === product.id && i.locked)) continue;
    let unit = Number(product.salePriceUsd ?? 0);
    if (quote.clientId) {
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
        quote.clientId,
        global
      );
      unit = prices.get(product.id)?.finalPriceUsd ?? unit;
    }
    const iva = product.ivaPercent != null ? Number(product.ivaPercent) : defaultIva;
    const desc = [product.brand?.name, product.normalizedName].filter(Boolean).join(" — ");
    const already = quote.items.find((i) => i.productId === product.id && !i.locked);
    if (already) {
      await prisma.quoteItem.update({
        where: { id: already.id },
        data: {
          quantity: new Prisma.Decimal(qty),
          lineTotalUsd: new Prisma.Decimal(unit * qty),
          unitPriceUsd: new Prisma.Decimal(unit),
          quantityRationale: row.rationale,
          source: QuoteNodeSource.SUGGESTED,
        },
      });
      continue;
    }
    sort += 1;
    await prisma.quoteItem.create({
      data: {
        quoteId,
        alternativeId: altId,
        kind: QuoteItemKind.PRODUCT,
        productId: product.id,
        quantity: new Prisma.Decimal(qty),
        unit: "u",
        description: desc,
        unitPriceUsd: new Prisma.Decimal(unit),
        lineTotalUsd: new Prisma.Decimal(unit * qty),
        ivaRate: new Prisma.Decimal(iva),
        source: QuoteNodeSource.SUGGESTED,
        quantityRationale: row.rationale,
        sortOrder: sort,
      },
    });
  }

  const sectionBodies = new Map((gen.sections || []).map((s) => [s.type, s.body]));
  for (const section of quote.sections) {
    if (section.locked) continue;
    if (!section.included) continue;
    if (!AI_MODULE_KEYS.includes(section.type)) continue;
    const body = sectionBodies.get(section.type) || "";
    if (!body) continue;
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: {
        body,
        source: QuoteNodeSource.GENERATED,
        origin: QuoteSectionOrigin.GENERATED,
        stale: false,
      },
    });
  }

  await fillMissingQuoteProductImages(quoteId);

  try {
    const productIds = (await prisma.quoteItem.findMany({
      where: { quoteId, productId: { not: null } },
      select: { productId: true },
    }))
      .map((i) => i.productId)
      .filter((id): id is string => Boolean(id));
    const hints = await suggestHistoricalCompanions(productIds);
    if (hints.length) {
      await prisma.quoteContext.upsert({
        where: { quoteId },
        create: { quoteId, notes: hints.map((h) => `Histórico: ${h.description} (${h.count})`).join("\n") },
        update: {
          notes: hints.map((h) => `Suele ir junto (planillas históricas): ${h.description}`).join("\n"),
        },
      });
    }
  } catch {
    /* históricos opcionales */
  }

  await prisma.quoteAiRun.create({
    data: {
      quoteId,
      userId,
      capability: QuoteAiCapability.BUILD_FROM_BRIEF,
      provider: oa.provider,
      model: oa.model,
      output: gen as object,
      accepted: true,
    },
  });

  return { ok: true as const };
}

export async function rewriteQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}) {
  if (input.kind === "section") {
    const section = await prisma.quoteSection.findUnique({ where: { id: input.nodeId } });
    if (!section || section.locked) throw new Error("Sección no editable.");
    const text = await quoteChatText(
      SOUNDTEC_VOICE,
      `Reescribí SOLO este bloque de cotización Soundtec según la instrucción. Conservá hechos. No inventes specs.\n\nInstrucción: ${input.instruction}\n\nTexto actual:\n${section.body}`
    );
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: { body: text, lastInstruction: input.instruction, source: QuoteNodeSource.GENERATED, stale: false },
    });
    return text;
  }
  const item = await prisma.quoteItem.findUnique({ where: { id: input.nodeId } });
  if (!item || item.locked) throw new Error("Ítem no editable.");
  const out = await quoteChatJson<{ description: string; quantity?: number }>(
    SOUNDTEC_VOICE + " Devolvé JSON { description, quantity? }.",
    `Instrucción: ${input.instruction}\nDescripción actual: ${item.description}\nCantidad: ${item.quantity}`
  );
  const qty = out.quantity && out.quantity > 0 ? out.quantity : Number(item.quantity);
  await prisma.quoteItem.update({
    where: { id: item.id },
    data: {
      description: out.description || item.description,
      quantity: new Prisma.Decimal(qty),
      lineTotalUsd: new Prisma.Decimal(Number(item.unitPriceUsd) * qty),
      lastInstruction: input.instruction,
      source: QuoteNodeSource.GENERATED,
    },
  });
  return out.description;
}
