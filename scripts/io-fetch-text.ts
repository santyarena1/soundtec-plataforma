/**
 * Muestra el texto de una ficha (página o PDF) tal como lo lee el sistema,
 * para citar textual al cargar una lectura manual.
 *   npx tsx scripts/io-fetch-text.ts <url> [máx caracteres]
 */

import { pageText } from "@/services/room-builder/io-profile/source";

const [url, max = "60000"] = process.argv.slice(2);

async function main() {
  if (!url) throw new Error("Falta la URL");
  const text = await pageText(url);
  console.log(text.slice(0, Number(max)));
}

main().catch((e) => {
  console.error(`No se pudo leer: ${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
