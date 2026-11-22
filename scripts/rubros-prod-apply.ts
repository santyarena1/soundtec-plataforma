/**
 * Datos de la pantalla «Rubros» para una base que ya tiene el esquema nuevo
 * (Category.hiddenFromCustomers, CategoryEquivalence, PriceReview):
 *
 *   1. ocultos   → marca «Ocultar a clientes» en INSUMOS GENERALES > INDUMENTARIA y SERVICIOS
 *                  (lo que antes era la lista fija de customer-hidden-categories.ts).
 *   2. equivalencias → carga como SUGERIDAS las equivalencias seguras «ruta del proveedor → rubro»
 *                  derivadas de productos ya ubicados (≥90 % al mismo rubro y al menos 3 productos).
 *   3. familias  → retira las reglas de precio FAMILY activas PASANDO por la revisión de precios:
 *                  simula con la cadena real; si el impacto no es 0, NO las retira y lo avisa.
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/rubros-prod-apply.ts                 → dry-run de los 3 pasos (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/rubros-prod-apply.ts --apply         → aplica los 3
 *   ... --only=ocultos|equivalencias|familias   → un solo paso
 *   ... --out=/ruta/detalle.json                → dónde guardar el detalle (por defecto, la carpeta temporal)
 *
 * Idempotente: una segunda corrida con --apply no cambia nada. Para producción:
 * ENV_FILE=.env.prod con backup de la base (rama Neon) antes. Las reglas FAMILY
 * quedan desactivadas (no borradas) y la revisión queda registrada como aplicada
 * en Precios › Revisión de cambios.
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
    if (!process.env[m[1]]) process.env[m[1]] = value;
  }
}

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const only = process.argv.find((a) => a.startsWith("--only="))?.slice("--only=".length);
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = outArg ?? path.join(os.tmpdir(), `rubros-prod-${stamp}.json`);
  const steps = only ? [only] : ["ocultos", "equivalencias", "familias"];

  const { prisma } = await import("../src/lib/prisma");
  const { DEFAULT_HIDDEN_TANGO_PATHS } = await import("../src/lib/customer-hidden-categories");
  const { suggestEquivalencesFromProducts } = await import("../src/server/categories/equivalences");
  const { simulateOperation } = await import("../src/server/price-review/engine");
  const { applyAndRecord } = await import("../src/server/price-review/reviews");
  const report: Record<string, unknown> = { mode: apply ? "apply" : "dry-run", at: new Date().toISOString() };

  if (steps.includes("ocultos")) {
    const rows = await prisma.category.findMany({
      where: { tangoPath: { in: DEFAULT_HIDDEN_TANGO_PATHS } },
      select: { id: true, tangoPath: true, hiddenFromCustomers: true },
    });
    const pending = rows.filter((r) => !r.hiddenFromCustomers);
    console.log(`Ocultos a clientes: ${rows.length} rubros de la lista de siempre encontrados, ${pending.length} sin marcar.`);
    for (const r of rows) console.log(`  ${r.hiddenFromCustomers ? "ya marcado" : "a marcar  "} · ${r.tangoPath}`);
    if (apply && pending.length) {
      await prisma.category.updateMany({ where: { id: { in: pending.map((r) => r.id) } }, data: { hiddenFromCustomers: true } });
      console.log(`  Aplicado: ${pending.length} marcados.`);
    }
    report.ocultos = rows;
  }

  if (steps.includes("equivalencias")) {
    const r = await suggestEquivalencesFromProducts(prisma, { apply, createdBy: "sugerida (script rubros-prod-apply)" });
    console.log(`Equivalencias sugeridas: ${r.candidates.length} seguras, ${r.skipped} ya estaban, ${apply ? `${r.created} creadas` : `${r.candidates.length - r.skipped} se crearían`}.`);
    const names = new Map(
      (await prisma.category.findMany({ where: { id: { in: r.candidates.map((c) => c.categoryId) } }, select: { id: true, tangoPath: true } })).map((c) => [c.id, c.tangoPath])
    );
    for (const c of r.candidates.slice(0, 40)) console.log(`  ${c.sourceLabel} → ${names.get(c.categoryId)} (${c.sampleCount} productos, ${Math.round(c.sampleShare * 100)} %)`);
    if (r.candidates.length > 40) console.log(`  … y ${r.candidates.length - 40} más (ver el JSON).`);
    report.equivalencias = r.candidates.map((c) => ({ ...c, rubro: names.get(c.categoryId) }));
  }

  if (steps.includes("familias")) {
    const [margins, discounts] = await Promise.all([
      prisma.marginRule.findMany({ where: { scopeType: "FAMILY", isActive: true }, select: { id: true, name: true } }),
      prisma.discountRule.findMany({ where: { scopeType: "FAMILY", isActive: true }, select: { id: true, name: true } }),
    ]);
    console.log(`Reglas FAMILY activas: ${margins.length} de margen, ${discounts.length} de descuento.`);
    for (const r of [...margins, ...discounts]) console.log(`  ${r.name}`);
    const note = "Retirada: las familias se reemplazan por series del fabricante (revisión de precios: 0 cambios).";
    const ops = [
      ...(margins.length ? [{ type: "rules.update" as const, kind: "margin" as const, ids: margins.map((r) => r.id), data: { isActive: false, notes: note } }] : []),
      ...(discounts.length ? [{ type: "rules.update" as const, kind: "discount" as const, ids: discounts.map((r) => r.id), data: { isActive: false, notes: note } }] : []),
    ];
    const results = [];
    for (const op of ops) {
      const sim = await simulateOperation(op);
      console.log(`  Simulación (${op.kind}): ${sim.summary.affectedProducts} productos cambiarían de precio.`);
      results.push({ kind: op.kind, summary: sim.summary, rows: sim.rows.slice(0, 200) });
      if (sim.summary.affectedProducts > 0) {
        console.log("  NO se retiran: el impacto no es 0. Revisalo antes (ver el JSON con la lista).");
        continue;
      }
      if (apply) {
        await applyAndRecord(op, `Retirar reglas FAMILY de ${op.kind === "margin" ? "margen" : "descuento"} (${op.ids.length})`, { id: "script", name: "Script rubros-prod-apply" });
        console.log("  Aplicado: desactivadas y registrado en Revisión de cambios.");
      }
    }
    report.familias = results;
  }

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n", "utf8");
  console.log(`Detalle: ${out}`);
  if (!apply) console.log("Dry-run: no se escribió nada. Agregá --apply para aplicar.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
