/**
 * Regenera src/data/crestron-home-official.json desde la documentación oficial
 * "Works with Crestron Home" (docs.crestron.com).
 *
 *   npx tsx scripts/crestron-home-official-fetch.ts            → descarga y escribe el JSON
 *   npx tsx scripts/crestron-home-official-fetch.ts --dry-run  → solo muestra el resumen
 *
 * Son 13 páginas públicas; se piden de a una con pausa. No usa base de datos.
 * Criterio (categorías, solo productos con link, variantes): ver
 * src/services/crestron-home/official-list.ts y match.ts.
 */
import fs from "node:fs";
import path from "node:path";
import {
  CRESTRON_HOME_CATEGORIES,
  CRESTRON_HOME_DOCS_INDEX_URL,
  CRESTRON_HOME_EXCLUDED_CATEGORIES,
  parseCategoryPage,
} from "../src/services/crestron-home/official-list";
import { crestronModelKey, normalizeCrestronModel } from "../src/services/crestron-home/match";

const OUT = path.join(__dirname, "..", "src", "data", "crestron-home-official.json");
const PAUSE_MS = 2000;
const USER_AGENT = "Mozilla/5.0 (Soundtec catálogo; lectura de la lista Works with Crestron Home)";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchPage(url: string): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (res.status === 429 || res.status === 403) throw new Error(`docs.crestron.com respondió ${res.status} en ${url}: se frena.`);
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.text();
}

interface OutModel {
  model: string;
  key: string;
  categories: string[];
  sections: string[];
  url: string;
  materialNumber: string | null;
  discontinued: boolean;
  description: string;
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const fetchedAt = new Date().toISOString();
  const models = new Map<string, OutModel>();
  const categories: { name: string; url: string; linkedRows: number; newModels: number }[] = [];

  for (const [i, cat] of CRESTRON_HOME_CATEGORIES.entries()) {
    if (i > 0) await sleep(PAUSE_MS);
    const rows = parseCategoryPage(await fetchPage(cat.url));
    let added = 0;
    for (const r of rows) {
      const id = normalizeCrestronModel(r.model);
      const prev = models.get(id);
      if (prev) {
        if (!prev.categories.includes(cat.name)) prev.categories.push(cat.name);
        if (r.section && !prev.sections.includes(r.section)) prev.sections.push(r.section);
        continue;
      }
      added++;
      models.set(id, {
        model: r.model,
        key: crestronModelKey(r.model),
        categories: [cat.name],
        sections: r.section ? [r.section] : [],
        url: r.url,
        materialNumber: r.materialNumber,
        discontinued: r.discontinued,
        description: r.description,
      });
    }
    categories.push({ name: cat.name, url: cat.url, linkedRows: rows.length, newModels: added });
    console.log(`${cat.name.padEnd(24)} ${String(rows.length).padStart(4)} con link · ${added} modelos nuevos`);
  }

  const out = {
    source: CRESTRON_HOME_DOCS_INDEX_URL,
    fetchedAt,
    generatedBy: "scripts/crestron-home-official-fetch.ts",
    criteria: [
      "Solo categorías: " + CRESTRON_HOME_CATEGORIES.map((c) => c.name).join(", ") + ".",
      "Excluidas: " + CRESTRON_HOME_EXCLUDED_CATEGORIES.join(", ") + ".",
      "Solo renglones con link a crestron.com (productos Crestron); sin link = otra marca, se ignora. Se ignoran las secciones 'Unsupported'.",
      "Variantes: se comparan modelos sin los segmentos finales de color/terminación/presentación (-B, -W, -A, -G, -T, -S, -BRZ, -GLASS, -BR-BRASS, -DRK-NKL, -EACH, etc.) y sin las palabras ENGRAVED/BLANK/KIT. Sufijos funcionales (-I, -NC, -R, -P, -E, -AW, -1G, -C) son otros modelos.",
      "Si el link es crestron.com/model/NNNNNNN también coincide por material number (internalSku).",
    ],
    categories,
    totalModels: models.size,
    models: [...models.values()],
  };

  console.log(`Total: ${models.size} modelos únicos con link en ${categories.length} categorías.`);
  if (dryRun) return;
  fs.writeFileSync(OUT, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`Escrito ${path.relative(process.cwd(), OUT)}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
