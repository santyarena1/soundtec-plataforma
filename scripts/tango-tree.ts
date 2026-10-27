/**
 * Carga el árbol de rubros de Tango como categorías (niveles 1 a 4; el 5 se ignora).
 * Cada nodo guarda su ruta original de Tango (`tangoPath`, en mayúsculas) y un
 * nombre legible («BAFLES PASIVOS» → «Bafles pasivos»). Es idempotente: vuelve a
 * correr sin duplicar.
 *
 *   npx tsx scripts/tango-tree.ts <Arbol_Rubros_Tango.csv>          (solo cuenta)
 *   npx tsx scripts/tango-tree.ts <Arbol_Rubros_Tango.csv> --apply  (escribe)
 */
import { readFileSync } from "node:fs";
import { prisma } from "../src/lib/prisma";
import { slugify } from "../src/lib/utils";
import { parseTangoTree, tangoDisplayName } from "../src/lib/tango-tree";

async function main() {
  const file = process.argv[2];
  const apply = process.argv.includes("--apply");
  if (!file) throw new Error("Falta la ruta del CSV.");
  const nodes = parseTangoTree(readFileSync(file, "utf8"));
  const existing = new Map((await prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, tangoPath: true } })).map((c) => [c.tangoPath!, c.id]));
  const missing = nodes.filter((n) => !existing.has(n.path));
  console.log(`Árbol: ${nodes.length} nodos · ya cargados ${existing.size} · por crear ${missing.length}`);
  if (!apply) return;
  // Por nivel, para que el padre exista antes que el hijo.
  for (const node of nodes) {
    const parentId = node.parentPath ? existing.get(node.parentPath) ?? null : null;
    const data = { name: tangoDisplayName(node.parts[node.parts.length - 1]!), parentId, level: node.level, isActive: true };
    const row = await prisma.category.upsert({
      where: { tangoPath: node.path },
      create: { ...data, tangoPath: node.path, slug: `t-${slugify(node.path).slice(0, 180)}` },
      update: data,
      select: { id: true },
    });
    existing.set(node.path, row.id);
  }
  console.log(`Listo: ${existing.size} nodos del árbol en la base.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
