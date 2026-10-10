/**
 * Importa lecturas de fichas hechas fuera del sistema. Por cada <id>.json de
 * la carpeta de lecturas toma el texto fuente exportado (más el que se haya
 * encontrado en la web) y guarda la lectura con la misma validación de citas.
 * Uso:
 *   npx tsx --env-file=.env.production.local scripts/io-manual-import.ts <fuentes> <lecturas> [lector]
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "@/lib/prisma";
import { saveManualReading } from "@/services/room-builder/io-profile/manual";

type Reading = {
  extraction: { applies?: boolean; ports?: unknown[]; capabilities?: Record<string, unknown>; notes?: string | null };
  /** Texto encontrado aparte (sitio del fabricante), que se suma al exportado para validar las citas. */
  extraText?: string;
  extraUrls?: string[];
  source?: "datasheet" | "specs" | "page" | "secondary";
};

const SOURCES = ["datasheet", "specs", "page", "secondary"] as const;

async function main() {
  const [srcDir, outDir, reader = "claude"] = process.argv.slice(2);
  if (!srcDir || !outDir) throw new Error("Uso: <fuentes> <lecturas> [lector]");
  const files = (await readdir(outDir)).filter((f) => f.endsWith(".json"));
  const tally: Record<string, number> = {};
  let rejected = 0;
  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    try {
      const reading = JSON.parse(await readFile(join(outDir, file), "utf8")) as Reading;
      const exported = JSON.parse(await readFile(join(srcDir, file), "utf8").catch(() => "{}")) as { sourceText?: string; urls?: string[]; kind?: string };
      const sourceText = [exported.sourceText ?? "", reading.extraText ?? ""].filter(Boolean).join("\n\n");
      if (!sourceText.trim()) {
        console.warn(`${id}: sin texto fuente, se omite`);
        continue;
      }
      const kind = reading.source ?? exported.kind;
      const result = await saveManualReading({
        productId: id,
        sourceText,
        sourceUrls: [...(exported.urls ?? []), ...(reading.extraUrls ?? [])].filter((u) => /^https?:\/\//.test(u)),
        source: (SOURCES as readonly string[]).includes(kind ?? "") ? (kind as (typeof SOURCES)[number]) : "page",
        extraction: reading.extraction,
        reader,
      });
      tally[result.status] = (tally[result.status] ?? 0) + 1;
      rejected += result.rejected.length;
      if (result.rejected.length) console.log(`${id}: ${result.status} · ${result.ports} puertos · descartado: ${result.rejected.map((r) => r.what).join("; ")}`);
    } catch (error) {
      console.error(`${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  console.log({ files: files.length, ...tally, rejectedItems: rejected });
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
