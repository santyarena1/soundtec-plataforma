/**
 * Exporta a archivos el texto fuente (specs, página y PDF del fabricante) de
 * los productos cuya ficha falta o quedó dudosa, para leerlos fuera del
 * sistema. Usa /api/integration/catalog-io con un token de integración.
 *   SOUNDTEC_URL=https://… CATALOG_IO_TOKEN=stk_… npx tsx scripts/io-manual-export.ts <carpeta> [estados] [límite]
 */

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const BATCH = 5;

async function main() {
  const [dir, statuses = "needs_review", max = "5000"] = process.argv.slice(2);
  const base = process.env.SOUNDTEC_URL;
  const token = process.env.CATALOG_IO_TOKEN;
  if (!dir || !base || !token) throw new Error("Faltan carpeta, SOUNDTEC_URL o CATALOG_IO_TOKEN");
  await mkdir(dir, { recursive: true });
  // "ids:<archivo>": exporta exactamente esos productos (uno por línea), sea cual sea su estado.
  if (statuses.startsWith("ids:")) {
    const ids = (await readFile(statuses.slice(4), "utf8")).split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    for (let i = 0; i < ids.length; i += BATCH) {
      const res = await fetch(`${base}/api/integration/catalog-io?ids=${ids.slice(i, i + BATCH).join(",")}&limit=${BATCH}`, { headers: { Authorization: `Bearer ${token}` } });
      const json = (await res.json()) as { ok: boolean; error?: string; items: Array<{ id: string }> };
      if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      for (const item of json.items) await writeFile(join(dir, `${item.id}.json`), JSON.stringify(item, null, 1));
      console.log(`${Math.min(i + BATCH, ids.length)}/${ids.length}`);
    }
    return;
  }
  let after = "";
  let written = 0;
  for (;;) {
    const url = `${base}/api/integration/catalog-io?status=${statuses}&limit=${BATCH}${after ? `&after=${after}` : ""}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const json = (await res.json()) as { ok: boolean; error?: string; remaining: number; items: Array<{ id: string }> };
    if (!json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
    if (!json.items.length) break;
    for (const item of json.items) {
      await writeFile(join(dir, `${item.id}.json`), JSON.stringify(item, null, 1));
      written++;
    }
    after = json.items[json.items.length - 1]!.id;
    console.log(`${written} exportados · quedan ${json.remaining - json.items.length}`);
    if (written >= Number(max)) break;
  }
  console.log(`listo: ${written}`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
