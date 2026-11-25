/**
 * Corrige la marca «descripción generada con IA» (Product.aiGeneratedDescription)
 * donde la puso un proceso que NO generó la descripción larga con IA. La ficha
 * mostraba «Generado con IA» sobre textos oficiales.
 *
 * Se desmarca (aiGeneratedDescription=false, aiDescriptionFeedbackStatus=null) si:
 *   A. Sin estado de revisión: el flag lo dejó la descripción CORTA (cotizaciones
 *      o «Generar con IA» del corto); la larga no la escribió la IA.
 *   B. La descripción larga está dentro del HTML oficial del fabricante.
 *   C. Crestron: la larga vino de crestron.com junto con el HTML oficial (mismo
 *      momento en fieldUpdatedAt) — el enriquecimiento viejo la marcaba como IA.
 *   D. JAMES: la larga es la traducción de la ficha oficial (scripts/data/james-enrich.json).
 * El resto queda como está y se lista (son las generadas con IA de verdad).
 * Los reportes de clientes (AiContentFeedback) no se tocan.
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/fix-ai-description-flags.ts            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/fix-ai-description-flags.ts --apply    → aplica
 *   … --out=<informe.json>
 *
 * Producción: ENV_FILE=.env.prod, primero en dry-run y con backup (rama Neon) antes de --apply.
 * Idempotente: una segunda corrida no encuentra nada para corregir.
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

type Reason = "A_solo_corto" | "B_html_oficial" | "C_crestron_com" | "D_james_traduccion";

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const out = outArg ? outArg.slice(6) : path.join(os.tmpdir(), `fix-ai-description-flags-${Date.now()}.json`);
  const { PrismaClient } = await import("@prisma/client");
  const { longDescriptionComesFromOfficialHtml } = await import("../src/lib/ai-content");
  const prisma = new PrismaClient();

  const jamesFile = path.join(__dirname, "data", "james-enrich.json");
  const james: Record<string, { longDescriptionEs?: string }> = fs.existsSync(jamesFile)
    ? JSON.parse(fs.readFileSync(jamesFile, "utf8")).products ?? {}
    : {};
  const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();

  const rows = await prisma.product.findMany({
    where: { aiGeneratedDescription: true },
    select: {
      id: true,
      internalSku: true,
      supplierSku: true,
      normalizedName: true,
      longDescription: true,
      htmlContent: true,
      aiDescriptionFeedbackStatus: true,
      fieldUpdatedAt: true,
      sourceMetadata: true,
      brand: { select: { name: true } },
    },
  });

  const fix: Array<{ id: string; sku: string | null; brand: string | null; name: string; reason: Reason }> = [];
  const keep: Array<{ id: string; sku: string | null; brand: string | null; name: string; status: string | null }> = [];
  for (const p of rows) {
    const brand = p.brand?.name ?? null;
    const stamps = (p.fieldUpdatedAt ?? {}) as Record<string, string>;
    const meta = (p.sourceMetadata ?? {}) as Record<string, unknown>;
    let reason: Reason | null = null;
    if (!p.aiDescriptionFeedbackStatus) reason = "A_solo_corto";
    else if (longDescriptionComesFromOfficialHtml(p.longDescription, p.htmlContent)) reason = "B_html_oficial";
    else if (
      /crestron/i.test(brand ?? "") &&
      meta.crestronCom != null &&
      stamps.longDescription &&
      stamps.longDescription === stamps.htmlContent
    )
      reason = "C_crestron_com";
    else if (/^james$/i.test(brand ?? "") && p.supplierSku && norm(james[p.supplierSku]?.longDescriptionEs) === norm(p.longDescription) && norm(p.longDescription))
      reason = "D_james_traduccion";
    const base = { id: p.id, sku: p.internalSku ?? p.supplierSku, brand, name: p.normalizedName };
    if (reason) fix.push({ ...base, reason });
    else keep.push({ ...base, status: p.aiDescriptionFeedbackStatus });
  }

  const byReason = fix.reduce<Record<string, number>>((acc, f) => ({ ...acc, [f.reason]: (acc[f.reason] ?? 0) + 1 }), {});
  const keepByBrand = keep.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k.brand ?? "(sin marca)"]: (acc[k.brand ?? "(sin marca)"] ?? 0) + 1 }), {});
  console.log(`Modo: ${apply ? "APLICAR" : "dry-run (no escribe)"}`);
  console.log(`Marcados como IA: ${rows.length} · a desmarcar: ${fix.length} · quedan marcados: ${keep.length}`);
  console.log("A desmarcar por motivo:", byReason);
  console.log("Quedan marcados (IA de verdad) por marca:", keepByBrand);
  for (const k of keep.slice(0, 30)) console.log(`  queda: ${k.brand ?? "-"} · ${k.sku ?? "-"} · ${k.name} (${k.status})`);

  if (apply && fix.length) {
    const ids = fix.map((f) => f.id);
    for (let i = 0; i < ids.length; i += 200) {
      await prisma.product.updateMany({
        where: { id: { in: ids.slice(i, i + 200) }, aiGeneratedDescription: true },
        data: { aiGeneratedDescription: false, aiDescriptionFeedbackStatus: null },
      });
    }
    console.log(`Desmarcados: ${fix.length}`);
  }
  fs.writeFileSync(out, JSON.stringify({ mode: apply ? "apply" : "dry-run", at: new Date().toISOString(), byReason, keepByBrand, fix, keep }, null, 2));
  console.log(`Detalle: ${out}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
