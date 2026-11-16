/**
 * Marca "Compatible con Crestron Home" según la lista OFICIAL
 * (src/data/crestron-home-official.json, regenerable con
 * scripts/crestron-home-official-fetch.ts).
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/crestron-home-apply.ts            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/crestron-home-apply.ts --apply    → aplica
 *   ... --out=/ruta/cambios.json   → dónde guardar el JSON antes/después (por defecto, la carpeta temporal)
 *
 * Idempotente: una segunda corrida con --apply no cambia nada.
 * Para producción: el mismo comando con ENV_FILE=.env.prod (con backup de la base antes),
 * o el botón "Marcar según lista oficial" de Admin → Crestron Home.
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
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = outArg ?? path.join(os.tmpdir(), `crestron-home-cambios-${stamp}.json`);

  const { prisma } = await import("../src/lib/prisma");
  const { planCrestronHomeFlags, applyCrestronHomeFlags } = await import("../src/services/crestron-home/apply");

  const before = await prisma.product.count({ where: { isCrestronHomeCompatible: true } });
  const plan = await planCrestronHomeFlags();
  const toTrue = plan.changes.filter((c) => c.after).length;
  const toFalse = plan.changes.length - toTrue;

  console.log(`Lista oficial: ${plan.officialModels} modelos (leída ${plan.fetchedAt}).`);
  console.log(`Productos Crestron en el catálogo: ${plan.crestronProducts}.`);
  console.log(`Marcados hoy: ${before} → quedarían: ${plan.willBeTrue} (${plan.willBeTrueActive} activos).`);
  console.log(`Cambios: ${toTrue} pasan a true, ${toFalse} pasan a false.`);
  console.log(`Modelos oficiales sin producto en el catálogo: ${plan.officialMissing.length}.`);

  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ mode: apply ? "apply" : "dry-run", at: new Date().toISOString(), before, ...plan }, null, 2) + "\n",
    "utf8",
  );
  console.log(`Detalle antes/después: ${out}`);

  if (!apply) {
    console.log("Dry-run: no se escribió nada. Agregá --apply para aplicar.");
  } else {
    const r = await applyCrestronHomeFlags(plan);
    const after = await prisma.product.count({ where: { isCrestronHomeCompatible: true } });
    console.log(`Aplicado: ${r.setTrue} → true, ${r.setFalse} → false. Marcados ahora: ${after}.`);
  }
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
