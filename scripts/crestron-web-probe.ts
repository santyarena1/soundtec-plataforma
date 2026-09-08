/**
 * Prueba en vivo del enriquecimiento de crestron.com sin tocar la base.
 *
 *   npx tsx scripts/crestron-web-probe.ts 6511816 CP4
 *   npx tsx scripts/crestron-web-probe.ts 6504877          (discontinuado)
 */
import { enrichCrestronProduct } from "../src/services/crestron-web/enrich";
import { toNormalizedProduct } from "../src/services/crestron-web/normalize";

async function main() {
  const [materialNumber, model] = process.argv.slice(2);
  if (!materialNumber) {
    console.error("Uso: tsx scripts/crestron-web-probe.ts <materialNumber> [modelo]");
    process.exit(1);
  }
  const started = Date.now();
  const enrichment = await enrichCrestronProduct({ materialNumber, model });
  const normalized = toNormalizedProduct(
    {
      internalSku: materialNumber,
      normalizedName: `(nombre actual) ${model ?? materialNumber}`,
      originalName: model ?? materialNumber,
      modelNumber: null,
    },
    enrichment
  );
  const { raw: _raw, ...withoutRaw } = normalized;
  void _raw;
  const summary = {
    ms: Date.now() - started,
    url: enrichment.page.url,
    model: enrichment.page.model,
    subtitle: enrichment.page.subtitle,
    materialNumber: enrichment.page.materialNumber,
    regulatoryModel: enrichment.page.regulatoryModel,
    isDiscontinued: normalized.isDiscontinued,
    categoryPath: enrichment.page.categoryPath,
    counts: {
      keyFeatures: enrichment.page.keyFeatures.length,
      footnotes: enrichment.page.footnotes.length,
      specs: enrichment.page.specs.length,
      images: enrichment.page.images.length,
      badges: enrichment.page.badges.length,
      documents: enrichment.documents.length,
      variants: enrichment.variants.length,
      inTheBox: enrichment.inTheBox.length,
      accessories: enrichment.accessories.length,
      related: enrichment.related.length,
      interestedIn: enrichment.interestedIn.length,
      replacements: enrichment.replacements.length,
      videos: enrichment.page.videoIds.length,
    },
    dims: {
      widthCm: normalized.widthCm,
      heightCm: normalized.heightCm,
      depthCm: normalized.depthCm,
      weight: normalized.weight,
    },
    warnings: enrichment.warnings,
    compatibleModels: enrichment.compatibleModels,
    search: enrichment.search,
    firstSpecs: enrichment.page.specs.slice(0, 6),
    dimensionSpecs: enrichment.page.specs.filter((s) => /dimension|weight/i.test(s.group)),
    images: enrichment.page.images.map((i) => ({ title: i.title, url: i.url, primary: i.isPrimary })),
    documents: enrichment.documents.slice(0, 8),
    variants: enrichment.variants,
    inTheBox: enrichment.inTheBox,
    accessories: enrichment.accessories.slice(0, 5),
    related: enrichment.related,
    badges: enrichment.page.badges,
    shortDescription: normalized.shortDescription,
    overviewTextHead: enrichment.page.overviewText.slice(0, 300),
    htmlHead: (normalized.htmlContent ?? "").slice(0, 300),
    legalText: (enrichment.page.legalText ?? "").slice(0, 120),
    normalizedKeys: Object.keys(withoutRaw).filter(
      (k) => (withoutRaw as Record<string, unknown>)[k] !== undefined
    ),
  };
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
