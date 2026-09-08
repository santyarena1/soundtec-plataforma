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
    warnings,
  };
}
