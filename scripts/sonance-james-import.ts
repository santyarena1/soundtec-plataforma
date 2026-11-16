/**
 * Importa / actualiza el catálogo JAMES desde my.sonance.com usando la cuenta
 * de facturación de James (5580105J). Usa el MISMO camino que el sync de Sonance
 * (conector "sonance" → pipeline → upsert por supplierSku): no crea duplicados,
 * actualiza por SKU, el costo es el My Price (realtimepricing) de la cuenta James.
 * Nunca toca carrito ni pedidos del portal.
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/sonance-james-import.ts            → preview (no escribe productos)
 *   ENV_FILE=.env.devbranch npx tsx scripts/sonance-james-import.ts --apply    → aplica
 *   ... --account=5580105J   (por defecto el setting sonance.james_account o 5580105J)
 *
 * Producción: el mismo comando con ENV_FILE=.env.prod, con backup de la base antes.
 */
import fs from "node:fs";

const DEFAULT_JAMES_ACCOUNT = "5580105J";
const BATCH_SIZE = 20;
const PAUSE_BETWEEN_BATCHES_MS = 1500;

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

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function jamesSnapshot() {
  const { prisma } = await import("../src/lib/prisma");
  const where = { brand: { name: { equals: "JAMES", mode: "insensitive" as const } } };
  const [total, active, withPrice] = await Promise.all([
    prisma.product.count({ where }),
    prisma.product.count({ where: { ...where, isActive: true } }),
    prisma.product.count({ where: { ...where, baseCostUsd: { gt: 0 } } }),
  ]);
  return { total, active, withPrice, withoutPrice: total - withPrice };
}

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const accountArg = process.argv.find((a) => a.startsWith("--account="))?.slice("--account=".length);

  const { prisma } = await import("../src/lib/prisma");
  const { getSetting } = await import("../src/lib/settings");
  process.env.SONANCE_ONLY_BRAND = "JAMES";
  process.env.SONANCE_JAMES_ACCOUNT =
    accountArg?.trim() || (await getSetting("sonance.james_account", "")).trim() || DEFAULT_JAMES_ACCOUNT;

  const { startRun, processBatch } = await import("../src/services/sync/pipeline");
  const before = await jamesSnapshot();
  console.log(`JAMES antes: ${JSON.stringify(before)} · cuenta ${process.env.SONANCE_JAMES_ACCOUNT} · ${apply ? "APPLY" : "preview"}`);

  const { runId } = await startRun("sonance", apply ? "apply" : "preview", "MANUAL");
  console.log(`run ${runId}`);
  const started = Date.now();
  for (;;) {
    const r = await processBatch(runId, BATCH_SIZE);
    const s = Math.round((Date.now() - started) / 1000);
    console.log(`  ${r.processed}/${r.total} · creados ${r.created} · actualizados ${r.updated} · sin cambios ${r.unchanged} · cambios de precio ${r.priceChanges} · errores ${r.errors} · ${s}s`);
    if (r.done) break;
    await sleep(PAUSE_BETWEEN_BATCHES_MS);
  }
  const run = await prisma.syncRun.findUnique({ where: { id: runId }, select: { status: true, error: true } });
  console.log(`estado: ${run?.status}${run?.error ? ` · ${run.error}` : ""}`);
  console.log(`JAMES después: ${JSON.stringify(await jamesSnapshot())}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
