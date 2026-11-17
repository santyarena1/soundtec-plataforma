/**
 * Catálogo solo con rubros de Tango.
 *
 * Cada producto ACTIVO que no está en un rubro del árbol de Tango (categoría
 * vieja, sin rubro o ya en «Sin categorizar») pasa:
 *   - a su rubro de Tango, SOLO si es inequívoco (ver decideTangoCategory en
 *     src/lib/tango-only.ts: propuesta alta, regla de data/tango/sin-categorizar-2026-11.json
 *     o el mismo modelo en otro acabado ya clasificado), o
 *   - a «Sin categorizar» (categoría temporal que ve solo el equipo), guardando
 *     su categoría vieja en CategoryProposal (tanda «sin-categorizar-2026-11»).
 * Después desactiva todas las categorías viejas (sin tangoPath) que quedan sin
 * productos activos, salvo «Sin categorizar».
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/categorias-solo-tango.ts            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/categorias-solo-tango.ts --apply    → aplica
 *   ... --out=/ruta/plan.json   → dónde guardar el detalle (por defecto, la carpeta temporal)
 *
 * Idempotente: una segunda corrida con --apply no cambia nada.
 * Producción: el mismo comando con ENV_FILE=.env.prod, con backup (rama Neon) antes.
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

/** Neon corta la conexión seguido («Can't reach database server»): reintentar. */
async function retry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const msg = String(error);
      const transient = /Can't reach database server|ECONNRESET|ETIMEDOUT|Connection terminated|P1001|P1017|P2024/i.test(msg);
      if (!transient || attempt >= 6) throw error;
      console.warn(`${label}: sin conexión, reintento ${attempt}…`);
      await new Promise((r) => setTimeout(r, 4000 * attempt));
    }
  }
}

async function main() {
  loadEnv(process.env.ENV_FILE);
  const apply = process.argv.includes("--apply");
  const outArg = process.argv.find((a) => a.startsWith("--out="))?.slice("--out=".length);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const out = outArg ?? path.join(os.tmpdir(), `categorias-solo-tango-${stamp}.json`);

  const { prisma } = await import("../src/lib/prisma");
  const { decideTangoCategory, isUncategorizedCategory, UNCATEGORIZED_SLUG } = await import("../src/lib/tango-only");
  const { ensureUncategorizedCategory, UNCATEGORIZED_BATCH } = await import("../src/server/uncategorized");
  const { TANGO_BATCH } = await import("../src/server/category-proposals");
  type ManualRule = import("../src/lib/tango-only").ManualRule;

  const manualRules = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "tango", "sin-categorizar-2026-11.json"), "utf8")) as ManualRule[];

  const [nodes, affected, classified, legacy] = await Promise.all([
    retry("rubros", () => prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, tangoPath: true } })),
    retry("productos", () =>
      prisma.product.findMany({
        where: { isActive: true, OR: [{ categoryId: null }, { category: { tangoPath: null } }] },
        select: {
          id: true,
          normalizedName: true,
          internalSku: true,
          brand: { select: { name: true } },
          category: { select: { id: true, name: true, slug: true } },
          categoryProposals: { where: { batch: TANGO_BATCH }, select: { id: true, tangoPath: true, confidence: true, status: true } },
        },
        orderBy: [{ brand: { name: "asc" } }, { normalizedName: "asc" }],
      }),
    ),
    retry("clasificados", () =>
      prisma.product.findMany({
        where: { isActive: true, category: { tangoPath: { not: null } } },
        select: { normalizedName: true, brand: { select: { name: true } }, category: { select: { tangoPath: true } } },
      }),
    ),
    retry("categorías viejas", () =>
      prisma.category.findMany({
        where: { tangoPath: null, isActive: true, slug: { not: UNCATEGORIZED_SLUG } },
        select: { id: true, name: true, slug: true, _count: { select: { products: { where: { isActive: true } } } } },
        orderBy: { name: "asc" },
      }),
    ),
  ]);

  const idByPath = new Map(nodes.map((n) => [n.tangoPath!, n.id]));
  const existingPaths = new Set(idByPath.keys());
  const siblings = classified.map((p) => ({ brand: p.brand?.name ?? "", model: p.normalizedName, tangoPath: p.category!.tangoPath! }));

  const plan = affected.map((p) => {
    const proposal = p.categoryProposals[0] ?? null;
    const decision = decideTangoCategory({ brand: p.brand?.name ?? null, model: p.normalizedName, proposal, siblings, manualRules, existingPaths });
    const inUncategorized = isUncategorizedCategory(p.category);
    return {
      productId: p.id,
      marca: p.brand?.name ?? null,
      modelo: p.normalizedName,
      sku: p.internalSku,
      categoriaVieja: p.category && !inUncategorized ? p.category.name : null,
      categoriaViejaId: p.category && !inUncategorized ? p.category.id : null,
      yaEnSinCategorizar: inUncategorized,
      propuesta: proposal ? `${proposal.tangoPath} (${proposal.confidence}, ${proposal.status})` : null,
      proposalId: proposal?.id ?? null,
      proposalPath: proposal?.tangoPath ?? null,
      proposalStatus: proposal?.status ?? null,
      nueva: decision.target === "tango" ? decision.tangoPath : "Sin categorizar",
      destino: decision.target,
      cambia: !(decision.target === "uncategorized" && inUncategorized),
      motivo: decision.motivo,
    };
  });

  const toTango = plan.filter((r) => r.destino === "tango");
  const toUncategorized = plan.filter((r) => r.destino === "uncategorized");
  const movedLegacy = new Map<string, number>();
  for (const r of plan) if (r.categoriaViejaId) movedLegacy.set(r.categoriaViejaId, (movedLegacy.get(r.categoriaViejaId) ?? 0) + 1);
  const legacyPlan = legacy.map((c) => ({
    id: c.id,
    nombre: c.name,
    productosActivosHoy: c._count.products,
    productosActivosDespues: c._count.products - (movedLegacy.get(c.id) ?? 0),
  }));
  const toDeactivate = legacyPlan.filter((c) => c.productosActivosDespues <= 0);
  const jamesOutside = plan.filter((r) => /james/i.test(r.marca ?? ""));

  const summary = {
    afectados: plan.length,
    aTango: toTango.length,
    aSinCategorizar: toUncategorized.length,
    yaEnSinCategorizar: plan.filter((r) => r.yaEnSinCategorizar).length,
    sinCambio: plan.filter((r) => !r.cambia).length,
    categoriasViejasActivas: legacy.length,
    categoriasADesactivar: toDeactivate.length,
    jamesFueraDelArbol: jamesOutside.length,
  };
  console.log(JSON.stringify(summary, null, 2));

  fs.mkdirSync(path.dirname(out), { recursive: true });
  const strip = ({ categoriaViejaId, proposalId, proposalPath, proposalStatus, ...rest }: (typeof plan)[number]) => {
    void categoriaViejaId; void proposalId; void proposalPath; void proposalStatus;
    return rest;
  };
  fs.writeFileSync(
    out,
    JSON.stringify(
      { mode: apply ? "apply" : "dry-run", at: new Date().toISOString(), summary, aTango: toTango.map(strip), aSinCategorizar: toUncategorized.map(strip), categoriasADesactivar: toDeactivate, categoriasViejasActivas: legacyPlan },
      null,
      2,
    ) + "\n",
    "utf8",
  );
  console.log(`Detalle: ${out}`);

  if (!apply) {
    console.log("Dry-run: no se escribió nada. Agregá --apply para aplicar.");
    await prisma.$disconnect();
    return;
  }

  const uncategorizedId = await retry("Sin categorizar", () => ensureUncategorizedCategory(prisma));
  const now = new Date();

  for (const r of toTango) {
    const categoryId = idByPath.get(r.nueva)!;
    await retry(`mover ${r.modelo}`, () =>
      prisma.$transaction(async (tx) => {
        await tx.product.update({ where: { id: r.productId }, data: { categoryId } });
        // La propuesta de la reclasificación que coincide queda decidida (se puede deshacer desde ahí).
        if (r.proposalId && r.proposalStatus === "PENDING" && r.proposalPath === r.nueva) {
          await tx.categoryProposal.update({
            where: { id: r.proposalId },
            data: { status: "APPROVED", appliedPath: r.nueva, previousCategoryId: r.categoriaViejaId ?? uncategorizedId, decidedAt: now },
          });
        }
      }),
    );
  }

  const pending = toUncategorized.filter((r) => r.cambia);
  if (pending.length) {
    await retry("guardar categoría vieja", () =>
      prisma.categoryProposal.createMany({
        data: pending.map((r) => ({
          productId: r.productId,
          batch: UNCATEGORIZED_BATCH,
          tangoPath: r.proposalPath ?? "",
          confidence: "baja",
          note: r.motivo.slice(0, 500),
          previousCategoryId: r.categoriaViejaId,
        })),
        skipDuplicates: true,
      }),
    );
    await retry("pasar a Sin categorizar", () =>
      prisma.product.updateMany({ where: { id: { in: pending.map((r) => r.productId) } }, data: { categoryId: uncategorizedId } }),
    );
  }

  const deactivated = await retry("desactivar viejas", () =>
    prisma.category.updateMany({
      where: { tangoPath: null, isActive: true, slug: { not: UNCATEGORIZED_SLUG }, products: { none: { isActive: true } } },
      data: { isActive: false },
    }),
  );
  console.log(`Aplicado: ${toTango.length} a Tango, ${pending.length} a Sin categorizar, ${deactivated.count} categorías viejas desactivadas.`);
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
