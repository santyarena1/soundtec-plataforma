import { Prisma, QuoteAiCapability, QuoteNodeSource, QuoteSectionOrigin } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { spacesWithSuggestions, type QuoteAiSuggestion } from "@/lib/quote-ai-suggestions";
import { AI_MODULE_KEYS, FIXED_MODULE_KEYS } from "@/lib/quote-defaults";
import { fillMissingQuoteProductImages } from "@/lib/quote-product-images";
import { fillMissingShortDescriptions } from "@/lib/product-short-description";
import { formatClassifierSummary, listQuoteClassifiers } from "@/lib/quote-classifiers";
import { loadQuotePatternSuggestions } from "@/lib/quote-pattern-suggest";
import { suggestHistoricalCompanions } from "@/server/actions/quote-history";
import {
  QUOTE_OPENAI_MISSING_KEY,
  SOUNDTEC_VOICE,
  describeQuotePlanImage,
  getQuoteOpenAI,
  quoteChatJson,
  quoteChatText,
} from "@/lib/quote-llm";
import { isRichText, sanitizeQuoteHtml } from "@/lib/quote-richtext";
import { buildProductSearchWhere, sortBySearchRelevance } from "@/lib/product-search";
import { normalizeForSearch } from "@/lib/search-key";
import { compactCode, modelTokens, pickCatalogMatch, type MatchCandidate } from "@/lib/quote-ai-match";
import {
  ANALYSIS_JSON_SCHEMA,
  ITEM_REWRITE_JSON_SCHEMA,
  SECTIONS_JSON_SCHEMA,
  analysisSchema,
  cleanProjectTitle,
  composeItemDescription,
  itemRewriteSchema,
  parseGeneratedSections,
  stripCodeFences,
  type QuoteAnalysis,
  type WrittenSectionType,
} from "@/lib/quote-ai-output";
import {
  EMPTY_BRIEF_ERROR,
  avoidedBrands,
  buildBriefBlocks,
  hasRealBrief,
  humanContextNotes,
  readQuoteIntake,
} from "@/lib/quote-ai-brief";
import { productFactsBlock, type ProductFacts } from "@/lib/quote-ai-items";
import { TONE_RULES, findGenericPhrases } from "@/lib/quote-ai-tone";
import { COMMERCIAL_BLOCK_MESSAGE, asksForCommercialChange, newCommercialClaims } from "@/lib/quote-ai-commercial-guard";

/** Regla para todos los prompts: las condiciones comerciales salen de otra sección del documento. */
const NO_COMMERCIAL_RULE =
  "No escribas condiciones comerciales (garantías, plazos de entrega, formas de pago, vigencia, descuentos, soporte o mantenimiento con plazos): salen de otra sección del documento, aunque el pedido o la instrucción las mencionen.";

/** Ítems con ficha completa en el prompt; el resto va solo con nombre y descripción corta. */
const DETAILED_ITEMS_LIMIT = 25;
const PLAN_READINGS_LIMIT = 4;

const PRODUCT_FACTS_SELECT = {
  normalizedName: true,
  originalName: true,
  modelNumber: true,
  shortDescription: true,
  longDescription: true,
  specifications: true,
  keyFeatures: true,
  brand: { select: { name: true } },
  category: { select: { name: true } },
} as const;

type ProductFactsRow = Prisma.ProductGetPayload<{ select: typeof PRODUCT_FACTS_SELECT }>;

function toFacts(product: ProductFactsRow): ProductFacts {
  return {
    brand: product.brand?.name,
    name: product.normalizedName,
    originalName: product.originalName,
    modelNumber: product.modelNumber,
    category: product.category?.name,
    shortDescription: product.shortDescription,
    longDescription: product.longDescription,
    specifications: product.specifications,
    keyFeatures: product.keyFeatures,
  };
}

async function catalogDigest(text: string) {
  const tokens = text
    .split(/[^\p{L}\p{N}]+/u)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3)
    .slice(0, 12);
  const select = {
    id: true,
    normalizedName: true,
    internalSku: true,
    supplierSku: true,
    modelNumber: true,
    brand: { select: { name: true } },
    category: { select: { name: true } },
  } as const;
  const or =
    tokens.length === 0
      ? undefined
      : tokens.flatMap((t) => [
          { normalizedName: { contains: t, mode: "insensitive" as const } },
          { originalName: { contains: t, mode: "insensitive" as const } },
          { modelNumber: { contains: t, mode: "insensitive" as const } },
          { brand: { name: { contains: t, mode: "insensitive" as const } } },
          { category: { name: { contains: t, mode: "insensitive" as const } } },
        ]);
  const rows = await prisma.product.findMany({
    where: { isActive: true, ...(or ? { OR: or } : {}) },
    take: 80,
    orderBy: { updatedAt: "desc" },
    select,
  });
  if (rows.length >= 8) return rows;
  return prisma.product.findMany({ where: { isActive: true }, take: 80, orderBy: { updatedAt: "desc" }, select });
}

const MATCH_SELECT = {
  id: true,
  normalizedName: true,
  originalName: true,
  modelNumber: true,
  internalSku: true,
  supplierSku: true,
  manufacturerItem: true,
  brand: { select: { name: true } },
} as const;

type MatchRow = Prisma.ProductGetPayload<{ select: typeof MATCH_SELECT }>;
type MatchCandidateRow = MatchCandidate & { row: MatchRow };

function toCandidate(row: MatchRow): MatchCandidateRow {
  return {
    id: row.id,
    normalizedName: row.normalizedName,
    originalName: row.originalName,
    modelNumber: row.modelNumber,
    internalSku: row.internalSku,
    supplierSku: row.supplierSku,
    manufacturerItem: row.manufacturerItem,
    brandName: row.brand?.name,
    row,
  };
}

/**
 * Busca el producto de una sugerencia. Primero por modelo/SKU (incluida la
 * clave normalizada sin espacios ni guiones), después con la búsqueda general
 * del catálogo; en los dos casos decide `pickCatalogMatch`, que exige que el
 * código de modelo coincida. Nunca asocia solo por marca.
 */
export async function matchProduct(search: string) {
  const q = search.trim();
  if (q.length < 3) return { kind: "none" as const };
  const tokens = modelTokens(q);
  const insensitive = (value: string) => ({ equals: value, mode: "insensitive" as const });
  const byCode: Prisma.ProductWhereInput[] = [
    { normalizedName: insensitive(q) },
    { originalName: insensitive(q) },
    ...tokens.flatMap((t) => [
      { modelNumber: insensitive(t) },
      { internalSku: insensitive(t) },
      { supplierSku: insensitive(t) },
      { manufacturerItem: insensitive(t) },
      { normalizedName: { contains: t, mode: "insensitive" as const } },
    ]),
    ...tokens
      .map((t) => normalizeForSearch(t))
      .filter((key) => key.length >= 3)
      .map((key) => ({ searchKey: { contains: key } })),
  ];
  const [codeRows, searchRows, modelRows] = await Promise.all([
    prisma.product.findMany({ where: { isActive: true, OR: byCode }, take: 60, select: MATCH_SELECT }),
    prisma.product.findMany({ where: { isActive: true, ...buildProductSearchWhere(q) }, take: 40, select: MATCH_SELECT }),
    tokens.length
      ? prisma.product.findMany({
          where: { isActive: true, ...buildProductSearchWhere(tokens.join(" ")) },
          take: 40,
          select: MATCH_SELECT,
        })
      : Promise.resolve([] as MatchRow[]),
  ]);
  const seen = new Set<string>();
  const merged = [...codeRows, ...searchRows, ...modelRows].filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
  const ranked = sortBySearchRelevance(merged.map(toCandidate), q, (c) => ({ ...c, brandName: c.brandName }));
  return pickCatalogMatch(q, ranked);
}

function brandIsAvoided(brandName: string | null | undefined, avoided: string[]) {
  const brand = compactCode(brandName);
  return Boolean(brand) && avoided.some((a) => compactCode(a) === brand);
}

function searchMentionsAvoided(search: string, avoided: string[]) {
  const words = search.split(/\s+/).map(compactCode);
  return avoided.some((a) => words.includes(compactCode(a)));
}

type SpacesBag = Record<string, unknown>;

function spacesBag(raw: unknown): SpacesBag {
  return raw && typeof raw === "object" && !Array.isArray(raw) ? { ...(raw as SpacesBag) } : {};
}

type PlanReading = { url: string; text: string };

function readPlanCache(spaces: SpacesBag): Record<string, PlanReading> {
  const raw = spaces.planReadings;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, PlanReading> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    if (typeof v.url === "string" && typeof v.text === "string" && v.text.trim()) out[id] = { url: v.url, text: v.text };
  }
  return out;
}

export type GenerateSectionReport = { title: string; reason: string };

export type GenerateProposalResult =
  | { ok: false; error: string }
  | {
      ok: true;
      written: string[];
      skipped: GenerateSectionReport[];
      failed: GenerateSectionReport[];
      suggestions: { matched: number; unmatched: number; ambiguous: number; services: number; avoided: number };
      warnings: string[];
    };

const ANALYSIS_RULES = `${SOUNDTEC_VOICE}
Tarea: leer el pedido de una cotización y proponer los equipos y servicios que faltan. NO redactás textos de la propuesta.
Autoridad: el PEDIDO DEL CLIENTE y las NOTAS DEL COMERCIAL mandan. El RELEVAMIENTO es dato firme. La REFERENCIA INTERNA solo orienta: si contradice el pedido, gana el pedido.
Si el relevamiento dice «No ofrecer: X», no propongas nada de la marca X.
projectTitle: título corto del proyecto tomado del pedido (ej. «Sala de directorio — Puerto Madero»). Nunca códigos ni números de referencia inventados («PROP-001», «COT-12»). Vacío si no está claro.
facts: solo lo que el pedido o las notas dicen explícitamente. assumptions: lo que suponés. questions: lo que falta saber para cotizar bien. risks: riesgos técnicos u operativos concretos.
items: equipos que faltan para el sistema, NO los que ya están cargados. search = marca + modelo exactos tal como aparecen en el catálogo listado. Si no hay un modelo concreto del catálogo que corresponda, no lo inventes: omití el ítem. kind PRODUCT o SERVICE (instalación, programación, puesta en marcha). serviceType: "instalacion", "programacion", "ingenieria" u otro corto; vacío para productos. rationale: una frase concreta de por qué.
No pongas precios.`;

const SECTION_RULES = `${SOUNDTEC_VOICE}
Redactás los módulos de proyecto de una COT Soundtec. Devolvés JSON { sections: [{ type, body }] } con un elemento por cada tipo pedido.
${NO_COMMERCIAL_RULE}
Contenido de cada tipo:
- proposal («Nuestra propuesta»): 2 a 3 párrafos. Qué problema del cliente se resuelve y cómo lo resuelven los equipos cargados.
- design_criteria («Criterios de diseño»): 3 a 6 viñetas con las decisiones técnicas (cobertura, cantidad de puntos, formato de señal, control, crecimiento) que se desprenden del pedido y de los equipos cargados.
- key_products («Productos clave»): los 3 a 6 equipos cargados más importantes; para cada uno, nombre en <strong> y qué hace en ESTE proyecto, usando solo su ficha.
- functionality («Funcionalidad»): cómo se usa el sistema en el día a día, paso a paso, en 1 o 2 párrafos o viñetas.
Fuente de datos: SOLO el pedido y la lista «Equipos cargados en la cotización». Prohibido mencionar equipos, marcas o modelos que no estén en esa lista. Si hay equipos cargados, tampoco nombres TIPOS de equipo que no estén cargados (proyector, pantalla, cámara, micrófono, etc.), salvo que el pedido o las notas digan que el cliente ya los tiene. Qué es cada equipo lo dicen su nombre, su descripción y su ficha; la categoría de catálogo es amplia y no alcanza para afirmarlo. Prohibido atribuir a un equipo capacidades que no figuren en su ficha. Si un equipo no tiene ficha, nombralo sin describir capacidades.
Si no hay equipos cargados, escribí en términos del objetivo del cliente (tipos de solución), sin marcas ni modelos.
PROHIBIDO: precios, condiciones comerciales, plazos, garantías, preguntas de "faltan datos", «[a confirmar]», copiar hilos de pedido, presentación de la empresa, ISO, cierre.
Formato del body: HTML acotado (p, strong, em, ul, ol, li, br), sin títulos (el módulo ya tiene título).
${TONE_RULES}`;

export async function generateQuoteProposal(quoteId: string, userId: string): Promise<GenerateProposalResult> {
  const oa = await getQuoteOpenAI();
  if (!oa) return { ok: false, error: QUOTE_OPENAI_MISSING_KEY };

  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      items: true,
      sections: { orderBy: { sortOrder: "asc" } },
      context: true,
      assets: true,
      classifierPicks: true,
    },
  });
  if (!quote) return { ok: false, error: "Cotización no encontrada." };
  if (quote.status === "ISSUED") return { ok: false, error: "La cotización ya está emitida: duplicala para regenerarla." };

  const intake = readQuoteIntake(quote.advancedIntake);
  const contextNotes = humanContextNotes(quote.context?.notes);
  // El control va antes de la visión: no se pagan lecturas de planos si no hay pedido.
  if (!hasRealBrief({ brief: quote.brief, notes: contextNotes, intake })) {
    return { ok: false, error: EMPTY_BRIEF_ERROR };
  }

  const warnings: string[] = [];
  let spaces = spacesBag(quote.context?.spaces);

  // Lectura de planos: se cachea por asset para no pagar la visión cada vez.
  const planCache = readPlanCache(spaces);
  const planNotes: string[] = [];
  const nextCache: Record<string, PlanReading> = {};
  for (const asset of quote.assets.filter((a) => a.kind === "PLAN" || a.kind === "PROJECT").slice(0, PLAN_READINGS_LIMIT)) {
    const cached = planCache[asset.id];
    if (cached && cached.url === asset.url) {
      planNotes.push(cached.text);
      nextCache[asset.id] = cached;
      continue;
    }
    try {
      const note = await describeQuotePlanImage(asset.url);
      if (note) {
        planNotes.push(note);
        nextCache[asset.id] = { url: asset.url, text: note };
      }
    } catch (error) {
      console.error("[quote-orchestrator] no se pudo leer el plano", asset.id, error);
      warnings.push(`No se pudo leer un plano (${error instanceof Error ? error.message : "error de visión"}).`);
    }
  }
  spaces = { ...spaces, planReadings: nextCache };

  const classifiers = await listQuoteClassifiers();
  const pickMap = Object.fromEntries(quote.classifierPicks.map((pick) => [pick.classifierId, pick.optionId]));
  const classification = formatClassifierSummary(classifiers, pickMap);
  const patterns = await loadQuotePatternSuggestions(quoteId);
  const patternBlock = [
    patterns.similar.length
      ? `Cotizaciones parecidas: ${patterns.similar.map((row) => `${row.number} (${row.labels})`).join("; ")}`
      : "",
    patterns.suggestions.length
      ? `Equipos que suelen usarse en este tipo de proyecto:\n${patterns.suggestions
          .map((item) => `- ${item.name} (${item.reason})`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const briefBlocks = buildBriefBlocks({
    brief: quote.brief,
    contextNotes,
    intake,
    projectType: quote.projectType,
    classification,
    planNotes,
    patternBlock,
  });
  const avoided = avoidedBrands(intake);

  const catalog = await catalogDigest([quote.brief, contextNotes, intake.notes, intake.brandPref].filter(Boolean).join(" "));
  const catalogText = catalog
    .filter((p) => !brandIsAvoided(p.brand?.name, avoided))
    .map((p) => `- ${p.brand?.name || ""} ${p.normalizedName}${p.modelNumber && !p.normalizedName.includes(p.modelNumber) ? ` (${p.modelNumber})` : ""}`)
    .join("\n");

  const existing = quote.items
    .filter((i) => !i.excluded)
    .map((i) => `- ${Number(i.quantity)} × ${i.description.split("\n")[0]}`)
    .join("\n");

  let analysis: QuoteAnalysis;
  try {
    analysis = await quoteChatJson(
      ANALYSIS_RULES,
      `${briefBlocks}

[EQUIPOS YA CARGADOS EN LA COTIZACIÓN — no los repitas en items]
${existing || "(ninguno)"}

[CATÁLOGO DISPONIBLE — items[].search tiene que salir de acá]
${catalogText || "(vacío)"}`,
      { schema: { name: "quote_analysis", schema: ANALYSIS_JSON_SCHEMA }, validate: analysisSchema }
    );
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "No se pudo leer el pedido con la IA." };
  }

  const title = cleanProjectTitle(analysis.projectTitle || analysis.reference);
  if (title && !quote.reference) {
    await prisma.quote.update({ where: { id: quoteId }, data: { reference: title } });
  }

  const alreadyOnQuote = new Set(quote.items.map((item) => item.productId).filter(Boolean) as string[]);
  const pending: QuoteAiSuggestion[] = [];
  const seenProduct = new Set<string>();
  const counts = { matched: 0, unmatched: 0, ambiguous: 0, services: 0, avoided: 0 };
  for (const [index, row] of analysis.items.entries()) {
    if (searchMentionsAvoided(row.search, avoided)) {
      counts.avoided += 1;
      continue;
    }
    if (row.kind === "SERVICE") {
      counts.services += 1;
      pending.push({
        key: `svc-${index}-${row.search.slice(0, 40)}`,
        productId: null,
        name: row.search,
        quantity: row.quantity,
        rationale: row.rationale || "Servicio sugerido por la IA",
        kind: "SERVICE",
        serviceType: row.serviceType || "instalacion",
      });
      continue;
    }
    const match = await matchProduct(row.search);
    if (match.kind !== "match") {
      const rationale =
        match.kind === "ambiguous"
          ? `Hay varias variantes en catálogo (${match.options
              .slice(0, 3)
              .map((o) => o.normalizedName)
              .join(", ")}). Elegí la que corresponda.`
          : "No se encontró ese modelo en el catálogo. Buscalo a mano si corresponde.";
      if (match.kind === "ambiguous") counts.ambiguous += 1;
      else counts.unmatched += 1;
      pending.push({
        key: `miss-${index}-${row.search.slice(0, 40)}`,
        productId: null,
        name: row.search,
        quantity: row.quantity,
        rationale: [row.rationale, rationale].filter(Boolean).join(" "),
        kind: "PRODUCT",
      });
      continue;
    }
    const product = match.product.row;
    if (brandIsAvoided(product.brand?.name, avoided)) {
      counts.avoided += 1;
      continue;
    }
    if (alreadyOnQuote.has(product.id) || seenProduct.has(product.id)) continue;
    seenProduct.add(product.id);
    counts.matched += 1;
    pending.push({
      key: `prd-${product.id}`,
      productId: product.id,
      name: [product.brand?.name, product.normalizedName].filter(Boolean).join(" — "),
      quantity: row.quantity,
      rationale: row.rationale || "Sugerido a partir del brief",
      kind: "PRODUCT",
    });
  }

  spaces = spacesWithSuggestions(spaces, pending);
  const contextData = {
    facts: analysis.facts,
    assumptions: analysis.assumptions,
    questions: analysis.questions,
    risks: analysis.risks,
    spaces: spaces as Prisma.InputJsonValue,
  };
  await prisma.quoteContext.upsert({
    where: { quoteId },
    create: { quoteId, ...contextData },
    update: contextData,
  });

  const sectionsReport = await writeProjectSections({
    quoteId,
    sections: quote.sections,
    briefBlocks,
    facts: analysis.facts.map((f) => f.text),
    pending,
  });

  await fillMissingQuoteProductImages(quoteId);
  const productIds = (
    await prisma.quoteItem.findMany({ where: { quoteId, productId: { not: null } }, select: { productId: true } })
  )
    .map((i) => i.productId)
    .filter((id): id is string => Boolean(id));
  const shorts = await fillMissingShortDescriptions(productIds);
  if (shorts.failed) warnings.push(`${shorts.failed} descripción(es) corta(s) de catálogo no se pudieron generar.`);

  try {
    const hints = await suggestHistoricalCompanions(productIds);
    // Van en `spaces`, no en `notes`: las notas son del comercial.
    const fresh = await prisma.quoteContext.findUnique({ where: { quoteId }, select: { spaces: true } });
    await prisma.quoteContext.update({
      where: { quoteId },
      data: {
        spaces: {
          ...spacesBag(fresh?.spaces),
          historicalHints: hints.map((h) => ({ description: h.description, count: h.count })),
        } as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    console.error("[quote-orchestrator] históricos", error);
  }

  await prisma.quoteAiRun.create({
    data: {
      quoteId,
      userId,
      capability: QuoteAiCapability.BUILD_FROM_BRIEF,
      provider: oa.provider,
      model: oa.model,
      output: {
        analysis,
        sections: sectionsReport.bodies,
        written: sectionsReport.written,
        skipped: sectionsReport.skipped,
        failed: sectionsReport.failed,
      } as unknown as Prisma.InputJsonValue,
      accepted: true,
    },
  });

  return {
    ok: true,
    written: sectionsReport.written,
    skipped: sectionsReport.skipped,
    failed: sectionsReport.failed,
    suggestions: counts,
    warnings,
  };
}

type SectionRow = {
  id: string;
  type: string;
  title: string;
  locked: boolean;
  included: boolean;
  source: QuoteNodeSource;
};

/** Códigos de modelo de las sugerencias pendientes que no están en la cotización. */
function pendingCodes(pending: QuoteAiSuggestion[], loadedText: string): string[] {
  const loaded = compactCode(loadedText);
  return [
    ...new Set(
      pending
        .filter((s) => s.kind === "PRODUCT")
        .flatMap((s) => modelTokens(s.name))
        .filter((t) => compactCode(t).length >= 4 && !loaded.includes(compactCode(t)))
    ),
  ];
}

function mentionedCodes(body: string, codes: string[]): string[] {
  const text = compactCode(body.replace(/<[^>]+>/g, " "));
  return codes.filter((code) => text.includes(compactCode(code)));
}

async function writeProjectSections(input: {
  quoteId: string;
  sections: SectionRow[];
  briefBlocks: string;
  facts: string[];
  pending: QuoteAiSuggestion[];
}): Promise<{
  written: string[];
  skipped: GenerateSectionReport[];
  failed: GenerateSectionReport[];
  bodies: Record<string, string>;
}> {
  const skipped: GenerateSectionReport[] = [];
  const failed: GenerateSectionReport[] = [];
  const written: string[] = [];
  const bodies: Record<string, string> = {};

  const liveItems = await prisma.quoteItem.findMany({
    where: { quoteId: input.quoteId, excluded: false },
    orderBy: { sortOrder: "asc" },
    include: { product: { select: PRODUCT_FACTS_SELECT } },
  });

  const targets: SectionRow[] = [];
  for (const section of input.sections) {
    if (!AI_MODULE_KEYS.includes(section.type) || !section.included) continue;
    if (section.locked) {
      skipped.push({ title: section.title, reason: "está fijado (candado)" });
      continue;
    }
    if (section.source === QuoteNodeSource.MANUAL) {
      skipped.push({ title: section.title, reason: "se editó a mano" });
      continue;
    }
    if (section.source === QuoteNodeSource.CORPORATE) {
      skipped.push({ title: section.title, reason: "tiene un texto elegido de la biblioteca" });
      continue;
    }
    if (section.type === "key_products" && liveItems.length === 0) {
      skipped.push({ title: section.title, reason: "no hay equipos cargados en la cotización" });
      continue;
    }
    targets.push(section);
  }
  if (targets.length === 0) return { written, skipped, failed, bodies };

  const itemLines = liveItems.map((item, index) => {
    const quantity = Number(item.quantity);
    if (!item.product) {
      const [first, ...rest] = item.description.split("\n");
      const extra = rest.join(" ").trim();
      return `- ${quantity} × ${first.trim()}${extra ? `\n  Detalle cargado: ${extra.slice(0, 300)}` : ""}\n  (ítem escrito a mano, sin ficha: no describas capacidades)`;
    }
    return productFactsBlock({ quantity, facts: toFacts(item.product), detail: index < DETAILED_ITEMS_LIMIT });
  });
  const loadedText = liveItems
    .map((i) => `${i.description} ${i.product?.normalizedName ?? ""} ${i.product?.modelNumber ?? ""}`)
    .join(" ");
  const codes = pendingCodes(input.pending, loadedText);

  const wanted = targets.map((s) => `${s.type} («${s.title}»)`).join(", ");
  const user = `${input.briefBlocks}
${input.facts.length ? `\n[HECHOS DEL PEDIDO]\n${input.facts.map((f) => `- ${f}`).join("\n")}\n` : ""}
[EQUIPOS CARGADOS EN LA COTIZACIÓN — única fuente para nombrar equipos]
${itemLines.join("\n") || "(ninguno: redactá sin marcas ni modelos)"}

Tipos a redactar: ${wanted}.`;

  const ask = async (extra: string) => {
    const raw = await quoteChatJson<unknown>(SECTION_RULES, extra ? `${user}\n\n${extra}` : user, {
      schema: { name: "quote_sections", schema: SECTIONS_JSON_SCHEMA },
      temperature: 0.35,
    });
    return parseGeneratedSections(raw);
  };
  // Las condiciones que vengan en las fichas (ej. garantía del fabricante) valen; las del brief, no.
  const factsText = itemLines.join("\n");
  const problems = (map: Map<WrittenSectionType, string>) => {
    const phrases = new Set<string>();
    const pendingHits = new Set<string>();
    const commercial = new Set<string>();
    for (const body of map.values()) {
      findGenericPhrases(body).forEach((p) => phrases.add(p));
      mentionedCodes(body, codes).forEach((c) => pendingHits.add(c));
      newCommercialClaims(factsText, body).forEach((c) => commercial.add(c));
    }
    return { phrases: [...phrases], pendingHits: [...pendingHits], commercial: [...commercial] };
  };

  let generated: Map<WrittenSectionType, string>;
  try {
    generated = await ask("");
    const first = problems(generated);
    if (first.phrases.length || first.pendingHits.length || first.commercial.length) {
      // Un reintento con la corrección explícita; se queda con el que tenga menos problemas.
      const fixes = [
        first.phrases.length ? `Sacá estas frases genéricas: ${first.phrases.map((p) => `«${p}»`).join(", ")}.` : "",
        first.pendingHits.length
          ? `Nombraste equipos que NO están cargados (${first.pendingHits.join(", ")}): sacalos.`
          : "",
        first.commercial.length
          ? `Escribiste condiciones comerciales (${first.commercial.join(", ")}): sacalas, van en otra sección.`
          : "",
      ]
        .filter(Boolean)
        .join(" ");
      try {
        const retry = await ask(`CORRECCIÓN de la versión anterior: ${fixes}`);
        const second = problems(retry);
        const score = (p: { phrases: string[]; pendingHits: string[]; commercial: string[] }) =>
          p.phrases.length + (p.pendingHits.length + p.commercial.length) * 10;
        if (retry.size >= generated.size && score(second) <= score(first)) generated = retry;
      } catch (error) {
        console.error("[quote-orchestrator] reintento de redacción", error);
      }
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : "la IA no respondió";
    for (const section of targets) failed.push({ title: section.title, reason });
    return { written, skipped, failed, bodies };
  }

  for (const section of targets) {
    let body = generated.get(section.type as WrittenSectionType) || "";
    if (body && mentionedCodes(body, codes).length) {
      failed.push({ title: section.title, reason: "nombraba equipos sugeridos que no están cargados" });
      continue;
    }
    if (body && newCommercialClaims(factsText, body).length) {
      failed.push({ title: section.title, reason: "prometía condiciones comerciales (garantía, plazos o pagos), que se definen en Pago, entrega y garantía" });
      continue;
    }
    if (!body) {
      failed.push({ title: section.title, reason: "la IA no devolvió texto para este módulo" });
      continue;
    }
    body = isRichText(body) ? sanitizeQuoteHtml(body) : body;
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: { body, source: QuoteNodeSource.GENERATED, origin: QuoteSectionOrigin.GENERATED, stale: false },
    });
    bodies[section.type] = body;
    written.push(section.title);
  }
  return { written, skipped, failed, bodies };
}

/** Arma el mensaje de resultado para la pantalla. */
export function describeGenerateResult(result: Extract<GenerateProposalResult, { ok: true }>): string {
  const parts: string[] = [];
  parts.push(result.written.length ? `Se redactó: ${result.written.join(", ")}.` : "No se redactó ningún módulo.");
  if (result.skipped.length) {
    parts.push(`No se tocó: ${result.skipped.map((s) => `${s.title} (${s.reason})`).join("; ")}.`);
  }
  if (result.failed.length) {
    parts.push(`Falló: ${result.failed.map((s) => `${s.title} (${s.reason})`).join("; ")}.`);
  }
  const s = result.suggestions;
  const total = s.matched + s.unmatched + s.ambiguous + s.services;
  if (total) {
    const detail = [
      s.matched ? `${s.matched} del catálogo` : "",
      s.ambiguous ? `${s.ambiguous} con varias variantes` : "",
      s.unmatched ? `${s.unmatched} sin modelo en catálogo` : "",
      s.services ? `${s.services} servicio(s)` : "",
    ]
      .filter(Boolean)
      .join(", ");
    parts.push(`Sugerencias en Productos para aprobar: ${detail}.`);
  } else {
    parts.push("Sin sugerencias de equipos nuevos.");
  }
  if (s.avoided) parts.push(`Se descartaron ${s.avoided} sugerencia(s) de marcas marcadas «No ofrecer».`);
  parts.push(...result.warnings);
  return parts.join(" ");
}

const CORPORATE_REVISE_RULES = `Este bloque es texto institucional, legal o comercial de SOUNDTEC.
Conservá TODOS los hechos: BNA (dólar oficial tipo vendedor), IVA, vigencia de la oferta, garantía de 12 meses, ISO 9001, IRAM, IQNet, partner autorizado, ART, seguro de vida, alcance de instalación y exclusiones (canalizaciones, gremios), certificación desde 2006.
No inventes precios, SKU, watts, protocolos ni plazos nuevos.
No elimines cláusulas ni datos legales o comerciales.
Tono institucional, serio, rioplatense formal.`;

const REWRITE_ONLY_RULES = `Reescribí ESTE módulo usando ÚNICAMENTE la instrucción del usuario, en la voz institucional SOUNDTEC del documento COT (mismo registro que el texto circundante).

PROHIBIDO de forma absoluta:
- Pedir o preguntar precios, cantidades, SKU u otros datos
- Inventar condiciones comerciales, plazos, garantías o cláusulas (aunque la instrucción las pida: si no están en el texto actual, no las agregues)
- Agregar preguntas tipo "faltan datos", "¿cuál es el presupuesto?", "necesito más información"
- Inventar productos, specs o precios
- Escribir «[a confirmar]» o marcadores parecidos
- Escribir meta-comentarios ("aquí expandí", "no tengo el precio", "faltaría confirmar")

Si la instrucción es corta (p.ej. "más largo"), expandí el texto actual conservando todos los hechos.
Si la instrucción es una reescritura completa, reemplazá el cuerpo con esa intención, manteniendo el tono institucional.
Devolvé SOLO el cuerpo del módulo, sin preámbulos.`;

export async function rewriteSectionBody(input: {
  title: string;
  type: string;
  body: string;
  instruction: string;
}) {
  if (asksForCommercialChange(input.instruction)) throw new Error(COMMERCIAL_BLOCK_MESSAGE);
  const html = isRichText(input.body);
  const corporate = FIXED_MODULE_KEYS.includes(input.type);
  const text = await quoteChatText(
    `Escribís módulos de cotización para SOUNDTEC S.R.L. Tono: ingeniero comercial serio, rioplatense formal, frases cortas, sin adjetivos vacíos.
${REWRITE_ONLY_RULES}
${corporate ? CORPORATE_REVISE_RULES : "Conservá hechos del texto actual. No inventes specs ni precios."}
${NO_COMMERCIAL_RULE}
${TONE_RULES}`,
    `Módulo «${input.title}» (${input.type}).
${html ? "El texto está en HTML acotado (p, h3, strong, em, ul, ol, li, br). Devolvé HTML del mismo tipo, sin markdown ni fences." : "Devolvé texto plano, sin markdown."}

Instrucción del usuario (única fuente de cambio):
${input.instruction}

Texto actual:
${input.body}`
  );
  const cleaned = stripCodeFences(text);
  if (!cleaned) throw new Error("La IA no devolvió texto.");
  if (newCommercialClaims(input.body, cleaned).length) throw new Error(COMMERCIAL_BLOCK_MESSAGE);
  return html || isRichText(cleaned) ? sanitizeQuoteHtml(cleaned) : cleaned;
}

/**
 * Reescribe la descripción de un ítem con la ficha real del producto. La
 * primera línea (título de la fila) se conserva siempre.
 */
async function rewriteItemText(
  item: { description: string; quantity: Prisma.Decimal; productId: string | null },
  instruction: string
): Promise<{ description: string; quantity: number | null }> {
  const product = item.productId
    ? await prisma.product.findUnique({ where: { id: item.productId }, select: PRODUCT_FACTS_SELECT })
    : null;
  const facts = product
    ? productFactsBlock({ quantity: Number(item.quantity), facts: toFacts(product) })
    : "(ítem sin producto de catálogo: no agregues specs ni capacidades)";
  if (asksForCommercialChange(instruction)) throw new Error(COMMERCIAL_BLOCK_MESSAGE);
  const [title, ...rest] = item.description.split("\n");
  const out = await quoteChatJson(
    `${SOUNDTEC_VOICE}
Reescribís el texto de UNA fila de la planilla de cotización.
La primera línea («título de la fila») NO se cambia: devolvé en description SOLO el texto que va debajo del título (1 a 3 líneas cortas).
Usá únicamente los datos de la ficha. Prohibido inventar specs, potencias, protocolos o compatibilidades. Prohibido «[a confirmar]»: si no hay dato, no lo pongas.
quantity: solo si la instrucción pide cambiar la cantidad; si no, null.
${TONE_RULES}`,
    `Instrucción: ${instruction}
Título de la fila (no se toca): ${title.trim()}
Texto actual debajo del título: ${rest.join("\n").trim() || "(vacío)"}
Cantidad actual: ${Number(item.quantity)}

Ficha del equipo:
${facts}`,
    { schema: { name: "quote_item", schema: ITEM_REWRITE_JSON_SCHEMA }, validate: itemRewriteSchema }
  );
  if (newCommercialClaims(`${item.description}\n${facts}`, out.description).length) throw new Error(COMMERCIAL_BLOCK_MESSAGE);
  return { description: composeItemDescription(item.description, out.description), quantity: out.quantity ?? null };
}

async function assertQuoteEditable(quoteId: string) {
  const quote = await prisma.quote.findUnique({ where: { id: quoteId }, select: { status: true } });
  if (!quote) throw new Error("Cotización no encontrada.");
  if (quote.status === "ISSUED") throw new Error("La cotización ya está emitida: duplicala para cambiarla.");
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
  const out = await rewriteItemText(item, instruction);
  return { body: out.description, previousBody: item.description };
}

export async function rewriteQuoteNode(input: {
  quoteId: string;
  nodeId: string;
  kind: "item" | "section";
  instruction: string;
}) {
  await assertQuoteEditable(input.quoteId);
  if (input.kind === "section") {
    const section = await prisma.quoteSection.findUnique({ where: { id: input.nodeId } });
    // El nodo tiene que ser de ESTA cotización (el permiso se chequeó sobre quoteId).
    if (!section || section.quoteId !== input.quoteId) throw new Error("Sección no encontrada.");
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
  if (!item || item.quoteId !== input.quoteId || item.locked) throw new Error("Ítem no editable.");
  const out = await rewriteItemText(item, input.instruction);
  const qty = out.quantity && out.quantity > 0 ? out.quantity : Number(item.quantity);
  await prisma.quoteItem.update({
    where: { id: item.id },
    data: {
      description: out.description,
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
No inventes precios, marcas ni equipos que no estén en el brief. No copies cláusulas legales de plantilla.
${TONE_RULES}`,
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

