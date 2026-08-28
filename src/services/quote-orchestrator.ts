import { Prisma, QuoteAiCapability, QuoteItemKind, QuoteNodeSource, QuoteSectionOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculatePricesForProducts } from "@/lib/pricing";
import { getGlobalMarginPercent, getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { AI_MODULE_KEYS, FIXED_MODULE_KEYS } from "@/lib/quote-defaults";
import { fillMissingQuoteProductImages } from "@/lib/quote-product-images";
import { fillMissingShortDescription } from "@/lib/product-short-description";
import { formatClassifierSummary, listQuoteClassifiers } from "@/lib/quote-classifiers";
import { loadQuotePatternSuggestions } from "@/lib/quote-pattern-suggest";
import { suggestHistoricalCompanions } from "@/server/actions/quote-history";
import { SOUNDTEC_VOICE, quoteChatJson, quoteChatText, getQuoteOpenAI, describeQuotePlanImage } from "@/lib/quote-llm";
import { isRichText, sanitizeQuoteHtml } from "@/lib/quote-richtext";

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
    include: {
      items: true,
      sections: true,
      alternatives: true,
      context: true,
      client: true,
      assets: true,
      classifierPicks: true,
    },
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

  const classifiers = await listQuoteClassifiers();
  const pickMap = Object.fromEntries(quote.classifierPicks.map((pick) => [pick.classifierId, pick.optionId]));
  const classification = formatClassifierSummary(classifiers, pickMap);
  const patterns = await loadQuotePatternSuggestions(quoteId);
  const patternBlock = [
    classification ? `Clasificación interna: ${classification}` : "",
    patterns.similar.length
      ? `COT parecidas: ${patterns.similar.map((row) => `${row.number} (${row.labels})`).join("; ")}`
      : "",
    patterns.suggestions.length
      ? `Equipos que suelen usarse en este patrón:\n${patterns.suggestions
          .map((item) => `- ${item.name} (${item.reason})`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const brief = [
    quote.brief,
    quote.reference,
    classification,
    quote.projectType,
    JSON.stringify(quote.advancedIntake || {}),
    patternBlock,
    planNotes.length ? `Lectura de planos:\n${planNotes.join("\n\n")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  if (brief.replace(/\s/g, "").length < 12) {
    return { ok: false as const, error: "Elegí tipo/escala o escribí un brief antes de generar." };
  }

  const catalog = await catalogDigest(brief);
  const catalogText = catalog
    .map(
      (p) =>
        `- ${p.brand?.name || ""} ${p.normalizedName} | sku:${p.internalSku || p.supplierSku || p.modelNumber || p.id}`
    )
    .join("\n");

  const existing = quote.items.map((i) => `${i.quantity} x ${i.description}`).join("\n");
  const problem = [quote.brief, quote.reference].filter(Boolean).join("\n");

  const gen = await quoteChatJson<GenOut>(
    `${SOUNDTEC_VOICE}
Devolvé JSON con:
reference, facts[], assumptions[], questions[], risks[], items[], sections[].
items[].search debe coincidir con un producto del catálogo listado (marca + modelo). quantity número. kind PRODUCT o SERVICE.
sections[].type uno de: proposal, design_criteria, key_products, functionality.
Para «proposal»: explicá POR QUÉ los productos de esta cotización y QUÉ problema resuelven. No copies hilos, mensajes ni respuestas de admin. No pidas precios. No inventes condiciones comerciales. No agregues preguntas de "faltan datos" dentro de sections[].
No reescribas presentación, marcas, ISO, condiciones, garantía ni cierre: eso es plantilla fija.
No pongas precios. No inventes productos que no estén en el catálogo; si falta, omití.`,
    `Problema a resolver:\n${problem || brief}
${patternBlock ? `\nPatrón interno (prioridad alta). Si pidieron una escala más grande, partí de la mediana/chica del mismo tipo y sumá lo que falte. No copies precios.\n${patternBlock}` : ""}

Ítems que YA están en la cotización (no los toques; usalos como base de la propuesta):
${existing || "(ninguno)"}

Catálogo disponible (solo para sugerir faltantes de sistema, no para volcar en la propuesta):
${catalogText || "(vacío)"}`
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
    if (quote.items.some((i) => i.productId === product.id)) continue;
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
            coefNac: product.coefNac != null ? Number(product.coefNac) : null,
            coefVta: product.coefVta != null ? Number(product.coefVta) : null,
            coefVtaFob: product.coefVtaFob != null ? Number(product.coefVtaFob) : null,
            ivaPercent: product.ivaPercent != null ? Number(product.ivaPercent) : null,
            impIntPercent: product.impIntPercent != null ? Number(product.impIntPercent) : null,
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
  const liveItems = await prisma.quoteItem.findMany({
    where: { quoteId, excluded: false },
    orderBy: { sortOrder: "asc" },
    include: { product: { select: { normalizedName: true, brand: { select: { name: true } } } } },
  });
  const productList =
    liveItems
      .map((item) => {
        const name =
          [item.product?.brand?.name, item.product?.normalizedName].filter(Boolean).join(" ") || item.description;
        return `- ${item.quantity} × ${name}`;
      })
      .join("\n") || existing;

  for (const section of quote.sections) {
    // locked = no pisar en generate. Un revise explícito sí puede tocar fijos.
    if (section.locked) continue;
    if (!section.included) continue;
    if (!AI_MODULE_KEYS.includes(section.type)) continue;
    let body = sectionBodies.get(section.type) || "";
    if (section.type === "proposal") {
      try {
        const proposal = await quoteChatText(
          `${SOUNDTEC_VOICE}
Redactá el módulo «Nuestra propuesta» de una COT Soundtec.
Mirá los productos que YA están en la cotización y el problema a resolver.
Explicá POR QUÉ esos productos y QUÉ se resuelve para el cliente.
Tono institucional, mismo registro que el resto del documento.
PROHIBIDO: pedir precios, inventar condiciones comerciales, copiar hilos de solicitud, agregar preguntas de "faltan datos", inventar equipos que no estén en la lista.
Devolvé solo el cuerpo, HTML acotado (p, strong, em, ul, ol, li, br) o texto plano.`,
          `Problema a resolver:\n${problem || brief}\n\nProductos y servicios de esta cotización:\n${productList || "(aún no hay ítems; redactá a partir del problema sin inventar marcas/modelos específicos)"}`
        );
        const cleaned = stripCodeFences(proposal);
        if (cleaned) body = isRichText(cleaned) ? sanitizeQuoteHtml(cleaned) : cleaned;
      } catch {
        /* cae al body del JSON */
      }
    }
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
    for (const productId of productIds) {
      try {
        await fillMissingShortDescription(productId);
      } catch {
        /* copy opcional */
      }
    }
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

const CORPORATE_REVISE_RULES = `Este bloque es texto institucional, legal o comercial de SOUNDTEC.
Conservá TODOS los hechos: BNA (dólar oficial tipo vendedor), IVA, vigencia de la oferta, garantía de 12 meses, ISO 9001, IRAM, IQNet, partner autorizado, ART, seguro de vida, alcance de instalación y exclusiones (canalizaciones, gremios), certificación desde 2006.
No inventes precios, SKU, watts, protocolos ni plazos nuevos.
No elimines cláusulas ni datos legales o comerciales.
Tono institucional, serio, rioplatense formal.`;

const REWRITE_ONLY_RULES = `Reescribí ESTE módulo usando ÚNICAMENTE la instrucción del usuario, en la voz institucional SOUNDTEC del documento COT (mismo registro que el texto circundante).

PROHIBIDO de forma absoluta:
- Pedir o preguntar precios, cantidades, SKU u otros datos
- Inventar condiciones comerciales, plazos, garantías o cláusulas
- Agregar preguntas tipo "faltan datos", "¿cuál es el presupuesto?", "necesito más información"
- Inventar productos, specs o precios
- Escribir meta-comentarios ("aquí expandí", "no tengo el precio", "faltaría confirmar")

Si la instrucción es corta (p.ej. "más largo"), expandí el texto actual conservando todos los hechos.
Si la instrucción es una reescritura completa, reemplazá el cuerpo con esa intención, manteniendo el tono institucional.
Devolvé SOLO el cuerpo del módulo, sin preámbulos.`;

function stripCodeFences(text: string) {
  return text.replace(/^```(?:html)?\s*/i, "").replace(/\s*```$/i, "").trim();
}

export async function rewriteSectionBody(input: {
  title: string;
  type: string;
  body: string;
  instruction: string;
}) {
  const html = isRichText(input.body);
  const corporate = FIXED_MODULE_KEYS.includes(input.type);
  const text = await quoteChatText(
    `Escribís módulos de cotización para SOUNDTEC S.R.L. Tono: ingeniero comercial serio, rioplatense formal, frases cortas, sin adjetivos vacíos.
${REWRITE_ONLY_RULES}
${corporate ? CORPORATE_REVISE_RULES : "Conservá hechos del texto actual. No inventes specs ni precios."}`,
    `Módulo «${input.title}» (${input.type}).
${html ? "El texto está en HTML acotado (p, h3, strong, em, ul, ol, li, br). Devolvé HTML del mismo tipo, sin markdown ni fences." : "Devolvé texto plano, sin markdown."}

Instrucción del usuario (única fuente de cambio):
${input.instruction}

Texto actual:
${input.body}`
  );
  const cleaned = stripCodeFences(text);
  if (!cleaned) throw new Error("La IA no devolvió texto.");
  return html || isRichText(cleaned) ? sanitizeQuoteHtml(cleaned) : cleaned;
}

export async function previewRewriteQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}) {
  const instruction = input.instruction.trim();
  if (instruction.length < 3) throw new Error("Escribí una instrucción.");
  if (input.kind === "section") {
    const section = await prisma.quoteSection.findUnique({ where: { id: input.nodeId } });
    if (!section || section.quoteId !== input.quoteId) throw new Error("Sección no encontrada.");
    const body = await rewriteSectionBody({
      title: section.title,
      type: section.type,
      body: section.body,
      instruction,
    });
    return { body, previousBody: section.body };
  }
  const item = await prisma.quoteItem.findUnique({ where: { id: input.nodeId } });
  if (!item || item.quoteId !== input.quoteId || item.locked) throw new Error("Ítem no editable.");
  const out = await quoteChatJson<{ description: string; quantity?: number }>(
    SOUNDTEC_VOICE + " Devolvé JSON { description, quantity? }.",
    `Instrucción: ${instruction}\nDescripción actual: ${item.description}\nCantidad: ${item.quantity}`
  );
  return { body: out.description || item.description, previousBody: item.description };
}

export async function rewriteQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}) {
  if (input.kind === "section") {
    const section = await prisma.quoteSection.findUnique({ where: { id: input.nodeId } });
    if (!section) throw new Error("Sección no encontrada.");
    // locked sólo bloquea generateProposal. Un revise explícito sí reescribe fijos.
    const text = await rewriteSectionBody({
      title: section.title,
      type: section.type,
      body: section.body,
      instruction: input.instruction,
    });
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: {
        body: text,
        lastInstruction: input.instruction,
        source: QuoteNodeSource.GENERATED,
        stale: false,
      },
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

export async function draftCustomModuleBody(input: {
  title: string;
  prompt: string;
  brief?: string | null;
}) {
  const text = await quoteChatText(
    `${SOUNDTEC_VOICE}
Escribís un módulo extra de cotización. 2 a 4 párrafos, frases cortas, sin adjetivos vacíos.
No inventes precios, marcas ni equipos que no estén en el brief. No copies cláusulas legales de plantilla.`,
    `Título del módulo: ${input.title}
Pedido del usuario:
${input.prompt}
${input.brief?.trim() ? `Brief de esta cotización:\n${input.brief.trim()}` : "No hay brief cargado."}
Devolvé texto plano, sin markdown ni títulos repetidos.`
  );
  const cleaned = stripCodeFences(text).trim();
  if (!cleaned) throw new Error("La IA no devolvió texto.");
  return isRichText(cleaned) ? sanitizeQuoteHtml(cleaned) : cleaned;
}

export async function rewriteQuoteTemplateBlock(input: { blockId: string; instruction: string }) {
  const block = await prisma.quoteBlock.findUnique({ where: { id: input.blockId } });
  if (!block) throw new Error("Módulo de plantilla no encontrado.");
  const text = await rewriteSectionBody({
    title: block.title,
    type: block.key,
    body: block.body,
    instruction: input.instruction,
  });
  await prisma.quoteBlock.update({
    where: { id: block.id },
    data: { body: text },
  });
  return text;
}
