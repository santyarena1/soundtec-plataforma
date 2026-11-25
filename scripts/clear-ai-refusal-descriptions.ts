/**
 * Busca productos cuya descripción corta o larga es una negativa o relleno de la IA
 * («Lo siento, no hay datos disponibles sobre el modelo…», «No dispongo de información…»,
 * «… descripción profesional no disponible en este momento.», el marcador SIN_DATOS)
 * y, con --apply, vacía ese campo para que se pueda regenerar. Si se vacía la larga
 * y estaba marcada como IA, se desmarca (aiGeneratedDescription=false, estado de revisión null).
 *
 * Mismo criterio que el freno al generar: src/lib/ai-text-guard.ts.
 * Una larga que está dentro del HTML oficial del fabricante no se toca (se lista aparte).
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/clear-ai-refusal-descriptions.ts            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/clear-ai-refusal-descriptions.ts --apply    → aplica
 *   … --out=<informe.json>   (el informe guarda los textos anteriores, para poder reponerlos)
 *
 * Producción: ENV_FILE=.env.prod, primero en dry-run y con backup (rama Neon) antes de --apply.
 * Idempotente: una segunda corrida no encuentra nada.
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
    process.env[m[1]] = value;
  }
}

const PAGE = 1000;

type Hit = {
  id: string;
  sku: string | null;
  brand: string | null;
  name: string;
  fields: Array<"short" | "long">;
  short: string | null;
  long: string | null;
  aiGeneratedDescription: boolean;
  aiDescriptionFeedbackStatus: string | null;
};

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const out = outArg ? outArg.slice(6) : path.join(os.tmpdir(), `clear-ai-refusal-descriptions-${Date.now()}.json`);
  const { PrismaClient } = await import("@prisma/client");
  const { isUnusableAiDescription } = await import("../src/lib/ai-text-guard");
  const { longDescriptionComesFromOfficialHtml } = await import("../src/lib/ai-content");
  const prisma = new PrismaClient();

  const hits: Hit[] = [];
  const officialSkipped: Array<{ id: string; sku: string | null; name: string; long: string }> = [];
  let scanned = 0;
  let cursor: string | undefined;
  for (;;) {
    const rows = await prisma.product.findMany({
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: "asc" },
      where: { OR: [{ shortDescription: { not: null } }, { longDescription: { not: null } }] },
      select: {
        id: true,
        internalSku: true,
        supplierSku: true,
        normalizedName: true,
        shortDescription: true,
        longDescription: true,
        htmlContent: true,
        aiGeneratedDescription: true,
        aiDescriptionFeedbackStatus: true,
        brand: { select: { name: true } },
      },
    });
    if (rows.length === 0) break;
    scanned += rows.length;
    cursor = rows[rows.length - 1].id;
    for (const p of rows) {
      const fields: Hit["fields"] = [];
      if (isUnusableAiDescription(p.shortDescription)) fields.push("short");
      if (isUnusableAiDescription(p.longDescription)) {
        if (longDescriptionComesFromOfficialHtml(p.longDescription, p.htmlContent)) {
          officialSkipped.push({ id: p.id, sku: p.internalSku ?? p.supplierSku, name: p.normalizedName, long: p.longDescription ?? "" });
        } else fields.push("long");
      }
      if (!fields.length) continue;
      hits.push({
        id: p.id,
        sku: p.internalSku ?? p.supplierSku,
        brand: p.brand?.name ?? null,
        name: p.normalizedName,
        fields,
        short: p.shortDescription,
        long: p.longDescription,
        aiGeneratedDescription: p.aiGeneratedDescription,
        aiDescriptionFeedbackStatus: p.aiDescriptionFeedbackStatus,
      });
    }
  }

  const shortCount = hits.filter((h) => h.fields.includes("short")).length;
  const longCount = hits.filter((h) => h.fields.includes("long")).length;
  const unflag = hits.filter((h) => h.fields.includes("long") && h.aiGeneratedDescription).length;
  console.log(`Modo: ${apply ? "APLICAR" : "dry-run (no escribe)"}`);
  console.log(`Productos revisados: ${scanned} · con negativa/relleno de IA: ${hits.length} (corta: ${shortCount} · larga: ${longCount} · a desmarcar IA: ${unflag})`);
  if (officialSkipped.length) console.log(`Largas que coinciden pero están en el HTML oficial (no se tocan): ${officialSkipped.length}`);
  for (const h of hits.slice(0, 40)) {
    const sample = (h.fields.includes("long") ? h.long : h.short)?.replace(/\s+/g, " ").slice(0, 110);
    console.log(`  ${h.brand ?? "-"} · ${h.sku ?? "-"} · ${h.name} [${h.fields.join("+")}] «${sample}»`);
  }
  if (hits.length > 40) console.log(`  … y ${hits.length - 40} más (ver el informe)`);

  if (apply && hits.length) {
    for (const h of hits) {
      const data: Record<string, unknown> = {};
      if (h.fields.includes("short")) data.shortDescription = null;
      if (h.fields.includes("long")) {
        data.longDescription = null;
        if (h.aiGeneratedDescription) {
          data.aiGeneratedDescription = false;
          data.aiDescriptionFeedbackStatus = null;
        }
      }
      // Solo si el texto sigue siendo el mismo (no pisar algo que se corrigió mientras tanto).
      await prisma.product.updateMany({
        where: {
          id: h.id,
          ...(h.fields.includes("short") ? { shortDescription: h.short } : {}),
          ...(h.fields.includes("long") ? { longDescription: h.long } : {}),
        },
        data,
      });
    }
    console.log(`Vaciados: ${hits.length} productos.`);
  }
  fs.writeFileSync(
    out,
    JSON.stringify(
      { mode: apply ? "apply" : "dry-run", env: process.env.ENV_FILE, at: new Date().toISOString(), scanned, total: hits.length, shortCount, longCount, unflag, hits, officialSkipped },
      null,
      2
    )
  );
  console.log(`Detalle: ${out}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
