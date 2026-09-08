/**
 * Orquestación del enriquecimiento de UN producto Crestron:
 * resuelve la ficha (por material number, fallback por modelo), descarga la
 * página y todos los bloques dinámicos, y devuelve la estructura completa.
 */

import {
  fetchOptionalAccessoriesHtml,
  fetchRelatedHtml,
  fetchReplacementsHtml,
  fetchResourcesHtml,
  fetchText,
  fetchVariantsHtml,
  findProductByModel,
  resolveProductUrlByMaterialNumber,
} from "./client";
import {
  parseAccessories,
  parseIncludedAccessoriesAttr,
  parseProductPage,
  parseProductSlider,
  parseResources,
  parseVariants,
} from "./parser";
import type { CrestronEnrichment, CrestronRelatedItem, CrestronSearchHit } from "./types";

export interface EnrichTarget {
  materialNumber: string;
  model?: string;
  /** URL ya conocida (de una corrida anterior) para evitar el redirect. */
  knownUrl?: string;
}

async function optional<T>(
  label: string,
  warnings: string[],
  task: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    return await task();
  } catch (error) {
    warnings.push(`${label}: ${error instanceof Error ? error.message : String(error)}`);
    return fallback;
  }
}

async function resolveUrl(
  target: EnrichTarget,
  warnings: string[]
): Promise<{ url: string; search?: CrestronSearchHit }> {
  const byMaterial = await optional(
    "resolver por material number",
    warnings,
    () => resolveProductUrlByMaterialNumber(target.materialNumber),
    null
  );
  if (byMaterial) {
    return { url: byMaterial };
  }
  if (target.model) {
    const hit = await optional(
      "buscar por modelo",
      warnings,
      () => findProductByModel(target.model!),
      null
    );
    if (hit) return { url: hit.url, search: hit };
  }
  if (target.knownUrl) return { url: target.knownUrl };
  throw new Error(
    `crestron.com no conoce el material number ${target.materialNumber}` +
      (target.model ? ` ni el modelo ${target.model}` : "")
  );
}

function mergeIncluded(
  fromAttr: CrestronRelatedItem[],
  fromHtml: CrestronRelatedItem[]
): CrestronRelatedItem[] {
  const byModel = new Map<string, CrestronRelatedItem>();
  for (const item of fromAttr) byModel.set(item.model.toUpperCase(), item);
  for (const item of fromHtml) {
    const key = item.model.toUpperCase();
    const previous = byModel.get(key);
    byModel.set(key, { ...previous, ...item, quantity: item.quantity ?? previous?.quantity });
  }
  return Array.from(byModel.values());
}

const MODEL_TOKEN = /\b(?:[A-Z]{2,5}\d{1,3}[A-Z]{0,2}|[A-Z][A-Z0-9]{1,}(?:-[A-Z0-9]{1,}){1,5})\b/g;
const IGNORED_TOKENS = new Set([
  "RS-232", "RS-422", "RS-485", "RS-232/422/485", "IEEE", "USB", "HDMI", "HDBaseT", "HDCP", "TCP", "UDP",
  "IPv4", "IPv6", "SNMP", "SSH", "TLS", "SSL", "HTTPS", "HTTP", "PoE", "PoE+", "AC", "DC", "LED", "LCD",
  "MP3", "MP4", "H264", "H265", "AAC", "PCM", "DHCP", "SMTP", "DNS", "UL", "CE", "FCC", "TAA", "CPU",
  "ANSI", "EN", "IEC", "ISO", "BACnet", "IR", "IO", "I/O", "COM", "LAN", "WAN", "VLAN", "QR", "SDRAM",
  "SDHC", "SD", "MB", "GB", "TB", "GHz", "MHz", "KHz", "VDC", "VAC", "BTU", "AWG", "RJ45", "RJ-45",
]);

/**
 * Extrae menciones de modelos (ej. "CP4", "DMPS3-4K-250-C") en los textos de la
 * ficha. Se validan después contra nuestro catálogo, así que puede ser generoso.
 */
export function extractModelMentions(texts: string[], exclude: string[]): string[] {
  const excluded = new Set(exclude.map((value) => value.toUpperCase()));
  const found = new Set<string>();
  for (const text of texts) {
    for (const match of text.replace(/[‑‐–]/g, "-").matchAll(MODEL_TOKEN)) {
      const token = match[0].toUpperCase();
      if (excluded.has(token) || IGNORED_TOKENS.has(match[0]) || IGNORED_TOKENS.has(token)) continue;
      if (!/\d/.test(token)) continue;
      found.add(token);
    }
  }
  return Array.from(found);
}

export async function enrichCrestronProduct(target: EnrichTarget): Promise<CrestronEnrichment> {
  const warnings: string[] = [];
  const resolved = await resolveUrl(target, warnings);
  const html = await fetchText(resolved.url);
  const page = parseProductPage(html, resolved.url);
  if (!page.model) {
    throw new Error(`La página ${resolved.url} no parece una ficha de producto`);
  }

  let search = resolved.search;
  if (!search) {
    search =
      (await optional(
        "buscar metadata",
        warnings,
        () => findProductByModel(page.model),
        null
      )) ?? undefined;
  }

  const { handlers } = page;

  const [documents, variantsResult, accessories, related, interestedIn, replacements] =
    await Promise.all([
      page.documentId
        ? optional("documentos", warnings, async () => parseResources(await fetchResourcesHtml(page.documentId!)), [])
        : Promise.resolve([]),
      handlers.variantList
        ? optional(
            "variantes",
            warnings,
            async () => parseVariants(await fetchVariantsHtml(handlers.variantList!)),
            { variants: [], inTheBox: [] }
          )
        : Promise.resolve({ variants: [], inTheBox: [] }),
      handlers.optionalAccessoryIds
        ? optional(
            "accesorios",
            warnings,
            async () => parseAccessories(await fetchOptionalAccessoriesHtml(handlers.optionalAccessoryIds!)),
            []
          )
        : Promise.resolve([]),
      handlers.relatedProducts && /true/i.test(handlers.relatedProducts.hasRelatedProduct ?? "")
        ? optional(
            "relacionados",
            warnings,
            async () => parseProductSlider(await fetchRelatedHtml(handlers.relatedProducts!)),
            []
          )
        : Promise.resolve([]),
      handlers.interestedIn && /true/i.test(handlers.interestedIn.hasRelatedProduct ?? "")
        ? optional(
            "te puede interesar",
            warnings,
            async () => parseProductSlider(await fetchRelatedHtml(handlers.interestedIn!)),
            []
          )
        : Promise.resolve([]),
      handlers.replacementIds
        ? optional(
            "reemplazos",
            warnings,
            async () =>
              parseProductSlider(
                await fetchReplacementsHtml(handlers.replacementIds!, handlers.replacementLabel ?? "")
              ),
            []
          )
        : Promise.resolve([]),
    ]);

  const inTheBox = mergeIncluded(
    parseIncludedAccessoriesAttr(handlers.variantList?.IncludedAcessories),
    variantsResult.inTheBox
  );

  const knownModels = [
    page.model,
    ...variantsResult.variants.map((item) => item.model),
    ...inTheBox.map((item) => item.model),
    ...accessories.map((item) => item.model),
    ...related.map((item) => item.model),
    ...interestedIn.map((item) => item.model),
  ];
  const compatibleModels = extractModelMentions(
    [
      page.overviewText,
      ...page.keyFeatures,
      ...page.footnotes,
      ...page.specs.map((row) => row.value),
    ],
    knownModels
  );

  return {
    fetchedAt: new Date().toISOString(),
    page,
    search,
    documents,
    variants: variantsResult.variants,
    inTheBox,
    accessories,
    related,
    interestedIn,
    replacements,
    compatibleModels,
    warnings,
  };
}
