/**
 * Corre el enriquecimiento crestron-web contra la base configurada.
 *
 *   ENV_FILE=/ruta/.env npx tsx scripts/crestron-web-run.ts preview 10   → sólo diff, sin escribir
 *   ENV_FILE=/ruta/.env npx tsx scripts/crestron-web-run.ts apply        → aplica todo
 *   ENV_FILE=/ruta/.env npx tsx scripts/crestron-web-run.ts verify 6511816
 */
import fs from "node:fs";

function loadEnv(file: string | undefined) {
  if (!file || !fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}
loadEnv(process.env.ENV_FILE);

async function main() {
  const [mode = "preview", arg] = process.argv.slice(2);
  const { prisma } = await import("../src/lib/prisma");
  const { startRun, processBatch } = await import("../src/services/sync/pipeline");

  if (mode === "verify") {
    const sku = arg;
    if (!sku) throw new Error("verify necesita un material number");
    const product = await prisma.product.findFirst({
      where: { internalSku: sku },
      include: {
        images: { orderBy: [{ isPrimary: "desc" }] },
        accessories: {
          include: { accessoryProduct: { select: { internalSku: true, originalName: true, normalizedName: true } } },
        },
      },
    });
    if (!product) throw new Error("no existe " + sku);
    const meta = (product.sourceMetadata as Record<string, unknown> | null) ?? {};
    const crestron = (meta.crestronCom as Record<string, unknown>) ?? null;
    const specs = (product.specifications as Array<Record<string, string>> | null) ?? [];
    const docs = (product.documents as Array<Record<string, string>> | null) ?? [];
    console.log(
      JSON.stringify(
        {
          internalSku: product.internalSku,
          normalizedName: product.normalizedName,
          originalName: product.originalName,
          modelNumber: product.modelNumber,
          manufacturerItem: product.manufacturerItem,
          baseCostUsd: product.baseCostUsd,
          stockStatus: product.stockStatus,
          stockQuantity: product.stockQuantity,
          shortDescription: product.shortDescription,
          longDescriptionHead: product.longDescription?.slice(0, 160),
          htmlContentLen: product.htmlContent?.length,
          metaTitle: product.metaTitle,
          metaDescription: product.metaDescription?.slice(0, 120),
          specsCount: specs.length,
          specsSample: specs.slice(0, 3),
          docsCount: docs.length,
          docsSample: docs.slice(0, 3),
          keyFeatures: product.keyFeatures,
          badges: product.badges,
          dims: { w: product.widthCm, h: product.heightCm, d: product.depthCm, weight: product.weight, volume: product.volume },
          vendorProductUrl: product.vendorProductUrl,
          urlSlug: product.urlSlug,
          videoUrl: product.videoUrl,
          isDiscontinued: product.isDiscontinued,
          regulatoryModel: product.regulatoryModel,
          sourceCategoryPath: product.sourceCategoryPath,
          vendorPublishedAt: product.vendorPublishedAt,
          enrichedAt: product.enrichedAt,
          fieldUpdatedAtKeys: Object.keys((product.fieldUpdatedAt as Record<string, unknown>) ?? {}),
          images: product.images.map((i) => ({ source: i.source, isPrimary: i.isPrimary, url: i.url })),
          relations: product.accessories.map((r) => ({
            kind: r.kind,
            qty: r.quantity,
            sku: r.accessoryProduct.internalSku,
            model: r.accessoryProduct.originalName,
          })),
          sourceMetadataKeys: Object.keys(meta),
          crestronCom: crestron
            ? {
                fetchedAt: crestron.fetchedAt,
                warnings: crestron.warnings,
                error: crestron.error,
                pageKeys: crestron.page ? Object.keys(crestron.page as object) : null,
              }
            : null,
        },
        null,
        2
      )
    );
    await prisma.$disconnect();
    return;
  }

  const limit = arg ? Number(arg) : Infinity;
  const { runId } = await startRun("crestron-web", mode === "apply" ? "apply" : "preview", "MANUAL");
  console.log(`run ${runId} (${mode})`);
  let processed = 0;
  const started = Date.now();
  for (;;) {
    const result = await processBatch(runId, 10);
    processed = result.processed;
    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(
      `  ${processed}/${result.total} · created ${result.created} · updated ${result.updated} · unchanged ${result.unchanged} · errors ${result.errors} · ${elapsed}s`
    );
    if (result.done || processed >= limit) break;
  }
  if (mode !== "apply" || processed < limit) {
    if (processed >= limit && !Number.isFinite(limit) === false) {
      await prisma.syncRun.update({
        where: { id: runId },
        data: { status: "CANCELLED", error: `Cortada manualmente en ${processed} productos`, finishedAt: new Date() },
      });
    }
  }
  const staged = await prisma.syncStagedProduct.findMany({
    where: { syncRunId: runId },
    orderBy: { matchValue: "asc" },
    select: { matchValue: true, action: true, status: true, diffJson: true, errorMessage: true, normalizedJson: true },
  });
  const errors = staged.filter((s) => s.status === "error" || s.errorMessage);
  const fails = staged.filter((s) => {
    const n = s.normalizedJson as Record<string, unknown> | null;
    return n && !n.vendorProductUrl;
  });
  console.log(`staged ${staged.length} · con error de pipeline ${errors.length} · sin ficha en crestron.com ${fails.length}`);
  for (const s of errors.slice(0, 10)) console.log("  ERROR", s.matchValue, s.errorMessage);
  for (const s of fails.slice(0, 15)) {
    const n = s.normalizedJson as Record<string, unknown>;
    console.log("  SIN FICHA", s.matchValue, n?.name);
  }
  const changedFields = new Map<string, number>();
  for (const s of staged) {
    const diff = s.diffJson as { changedFields?: string[]; changes?: Array<{ field: string }> } | null;
    const fields = diff?.changedFields ?? diff?.changes?.map((c) => c.field) ?? [];
    for (const f of fields) changedFields.set(f, (changedFields.get(f) ?? 0) + 1);
  }
  console.log("campos que cambian (cantidad de productos):");
  for (const [field, count] of [...changedFields.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${field.padEnd(24)} ${count}`);
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
