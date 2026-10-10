/**
 * Sube lecturas de fichas hechas fuera del sistema. Por cada <id>.json de la
 * carpeta de lecturas toma el texto fuente exportado (más el encontrado en la
 * web) y lo manda a /api/integration/catalog-io, que valida las citas igual
 * que la lectura automática.
 *   SOUNDTEC_URL=https://… CATALOG_IO_TOKEN=stk_… npx tsx scripts/io-manual-import.ts <fuentes> <lecturas> [lector]
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

type Reading = {
  extraction: { applies?: boolean; ports?: unknown[]; capabilities?: Record<string, unknown>; notes?: string | null };
  /** Fichas oficiales encontradas en la web: el servidor las baja y valida las citas contra ese texto. */
  extraUrls?: string[];
  source?: "datasheet" | "specs" | "page" | "secondary";
};
type Result = { productId: string; status?: string; ports?: number; rejected?: Array<{ what: string }>; error?: string };

const SOURCES = ["datasheet", "specs", "page", "secondary"];
/** Tandas chicas: el servidor baja las fichas de la web de cada lectura. */
const CHUNK = 4;
const MAX_TEXT = 118_000;

async function main() {
  const [srcDir, outDir, reader = "claude"] = process.argv.slice(2);
  const base = process.env.SOUNDTEC_URL;
  const token = process.env.CATALOG_IO_TOKEN;
  if (!srcDir || !outDir || !base || !token) throw new Error("Uso: <fuentes> <lecturas> [lector] con SOUNDTEC_URL y CATALOG_IO_TOKEN");
  const files = (await readdir(outDir)).filter((f) => f.endsWith(".json"));
  const readings = [];
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    try {
      const r = JSON.parse(await readFile(join(outDir, file), "utf8")) as Reading;
      const exp = JSON.parse(await readFile(join(srcDir, file), "utf8").catch(() => "{}")) as { sourceText?: string; urls?: string[]; kind?: string };
      const sourceText = (exp.sourceText ?? "").slice(0, MAX_TEXT);
      const fetchUrls = (r.extraUrls ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 3);
      // Sin texto ni ficha encontrada: solo se acepta "sin conexiones" (repuestos), con la nota como fuente.
      if (!sourceText.trim() && !fetchUrls.length && r.extraction.applies !== false) {
        console.warn(`${id}: sin texto fuente, se omite`);
        continue;
      }
      const kind = r.source && SOURCES.includes(r.source) ? r.source : (exp.kind ?? "page");
      readings.push({
        productId: id,
        sourceText: sourceText.trim() ? sourceText : (r.extraction.notes ?? "Sin conexiones de señal."),
        sourceUrls: (exp.urls ?? []).filter((u) => /^https?:\/\//.test(u)).slice(0, 5),
        fetchUrls,
        source: SOURCES.includes(kind) ? kind : "page",
        extraction: { ...r.extraction, notes: r.extraction.notes ?? undefined },
        reader,
      });
    } catch (error) {
      console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const tally: Record<string, number> = {};
  for (let i = 0; i < readings.length; i += CHUNK) {
    const res = await fetch(`${base}/api/integration/catalog-io`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ readings: readings.slice(i, i + CHUNK) }),
    });
    const json = (await res.json()) as { ok: boolean; error?: string; issues?: unknown; results?: Result[] };
    if (!json.ok) {
      console.error(`tanda ${i / CHUNK + 1}: ${json.error} ${JSON.stringify(json.issues ?? "")}`);
      continue;
    }
    for (const r of json.results ?? []) {
      const key = r.error ? "error" : (r.status ?? "?");
      tally[key] = (tally[key] ?? 0) + 1;
      if (r.error || r.rejected?.length) console.log(`${r.productId}: ${r.error ?? `${r.status} · ${r.ports} puertos · descartado: ${r.rejected!.map((x) => x.what).join("; ")}`}`);
    }
  }
  console.log({ files: files.length, sent: readings.length, ...tally });
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
