/**
 * Llena las SERIES del fabricante (ProductLine + Product.lineId) desde datos que
 * ya existen: ruta de crestron.com, atributo «Product Category» del portal
 * Sonance (Sonance/James/IPORT/Blaze), el campo `line` (Blaze, Bluesound) y
 * prefijos de modelo con reglas explícitas. Lo dudoso queda sin serie.
 * También limpia los `productLine` que quedaron con JSON crudo del portal.
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/product-lines-apply.ts            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/product-lines-apply.ts --apply    → aplica
 *   ... --out=/ruta/series.json   → dónde guardar lo detectado por marca (por defecto, la carpeta temporal)
 *
 * Idempotente: no pisa series ya asignadas y reusa las existentes por (marca, slug).
 * Producción: primero dry-run con ENV_FILE=.env.prod; aplicar solo con OK del dueño
 * y backup de la base (rama Neon) antes.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function loadEnv(file: string | undefined) {
  if (!file || !fs.existsSync(file)) throw new Error("Indicá ENV_FILE con la base a usar (ej. ENV_FILE=.env.devbranch).");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2];
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    // El archivo indicado manda sobre lo que haya en el entorno (evita escribir en otra base).
    process.env[m[1]] = value;
  }
}

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = outArg ?? path.join(os.tmpdir(), `series-detectadas-${stamp}.json`);

  const { prisma } = await import("../src/lib/prisma");
  const { planProductLines, applyProductLines } = await import("../src/services/product-lines/plan");

  const plan = await planProductLines(prisma);
  const summary = plan.brands
    .filter((b) => b.withSeries > 0 || b.ambiguous.length > 0)
    .map((b) => `${b.brand}: ${b.series.length} series nuevas/detectadas, ${b.withSeries}/${b.products} con serie (${b.alreadyAssigned} ya tenían), ${b.ambiguous.length} ambiguos`);
  console.log(`ENV_FILE=${process.env.ENV_FILE} · ${apply ? "APLICANDO" : "dry-run (no escribe)"}`);
  for (const l of summary) console.log("  " + l);
  console.log(`  Series a crear: ${plan.newSeries.length} · productos a asignar: ${plan.assignments.length} · productLine con JSON crudo: ${plan.productLineCleanup.length}`);

  let result = null;
  if (apply) {
    result = await applyProductLines(prisma, plan);
    console.log(`  Hecho: ${result.seriesCreated} series creadas, ${result.productsAssigned} productos asignados, ${result.productLineCleaned} productLine limpiados.`);
  }
  fs.writeFileSync(
    out,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        envFile: process.env.ENV_FILE,
        applied: apply,
        result,
        totals: { newSeries: plan.newSeries.length, assignments: plan.assignments.length, productLineCleanup: plan.productLineCleanup.length },
        brands: plan.brands,
        productLineCleanup: plan.productLineCleanup,
      },
      null,
      2
    )
  );
  console.log(`  Detalle por marca: ${out}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
