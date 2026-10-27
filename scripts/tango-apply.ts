/**
 * Aplica la clasificación en el árbol de Tango: un JSON [{ id, ruta }] (ruta =
 * tangoPath, ej. «SONIDO > BAFLES PASIVOS > BAFLES DE EMBUTIR») → product.categoryId.
 * No toca familia ni precios. Las categorías viejas (fuera del árbol) quedan
 * desactivadas, no se borran.
 *
 *   npx tsx scripts/tango-apply.ts <clasificacion.json>           (solo cuenta)
 *   npx tsx scripts/tango-apply.ts <clasificacion.json> --apply   (escribe)
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";

type Row = { id: string; ruta: string };

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Falta el JSON de clasificación.");
  const rows = JSON.parse(readFileSync(file, "utf8")) as Row[];

  const nodes = await prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, tangoPath: true } });
  const nodeByPath = new Map(nodes.map((n) => [n.tangoPath!, n.id]));
  const products = await prisma.product.findMany({ select: { id: true, categoryId: true } });
  const current = new Map(products.map((p) => [p.id, p.categoryId]));

  const unknownPaths = [...new Set(rows.filter((r) => !nodeByPath.has(r.ruta)).map((r) => r.ruta))];
  const unknownProducts = rows.filter((r) => !current.has(r.id)).length;
  if (unknownPaths.length) throw new Error(`Rutas que no están en el árbol: ${unknownPaths.slice(0, 5).join(" | ")}`);

  const changes = rows.filter((r) => current.has(r.id) && current.get(r.id) !== nodeByPath.get(r.ruta));
  const unclassified = products.filter((p) => !rows.some((r) => r.id === p.id)).length;
  console.log(`Clasificados: ${rows.length} · cambian: ${changes.length} · ids que ya no existen: ${unknownProducts} · productos sin clasificar: ${unclassified}`);
  if (!apply) return;

  // De a tandas: cada producto a su nodo.
  const byNode = new Map<string, string[]>();
  for (const r of changes) byNode.set(nodeByPath.get(r.ruta)!, [...(byNode.get(nodeByPath.get(r.ruta)!) ?? []), r.id]);
  let done = 0;
  for (const [categoryId, ids] of byNode) {
    await prisma.product.updateMany({ where: { id: { in: ids } }, data: { categoryId } });
    done += ids.length;
  }
  const old = await prisma.category.updateMany({ where: { tangoPath: null, isActive: true }, data: { isActive: false } });
  console.log(`Listo: ${done} productos movidos al árbol · ${old.count} categorías viejas desactivadas.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
