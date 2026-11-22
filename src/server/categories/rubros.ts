/**
 * Rubros del árbol de Tango del lado del servidor: validar que un id sea un
 * rubro válido (todas las acciones que asignan rubro pasan por acá) y crear
 * subrubros desde la app (quedan «pendientes de cargar en Tango»).
 */
import { prisma } from "@/lib/prisma";
import { checkNewSubrubro } from "@/lib/rubros";
import { tangoDisplayName } from "@/lib/tango-tree";
import { resetCategoryAncestorsCache } from "@/lib/pricing";
import type { Db } from "@/server/pricing/rule-save";

export type RubroValidation = { ok: true } | { ok: false; error: string };

/** Todos los ids tienen que ser rubros activos del árbol de Tango. */
export async function validateRubroIds(db: Db, ids: string[]): Promise<RubroValidation> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return { ok: true };
  const rows = await db.category.findMany({
    where: { id: { in: unique } },
    select: { id: true, tangoPath: true, isActive: true, name: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const id of unique) {
    const row = byId.get(id);
    if (!row) return { ok: false, error: "Uno de los rubros elegidos ya no existe. Recargá la página." };
    if (!row.tangoPath || !row.isActive) {
      return { ok: false, error: `«${row.name}» no es un rubro del árbol de Tango: elegí uno del árbol.` };
    }
  }
  return { ok: true };
}

/**
 * Rubro para un producto: tiene que ser del árbol de Tango. Se acepta dejarlo
 * como estaba (un rubro viejo o «Sin categorizar») para no obligar a
 * reclasificar al editar otra cosa.
 */
export async function validateProductRubro(
  db: Db,
  categoryId: string | null,
  currentCategoryId: string | null
): Promise<RubroValidation> {
  if (!categoryId || categoryId === currentCategoryId) return { ok: true };
  return validateRubroIds(db, [categoryId]);
}

export interface CreatedRubro {
  id: string;
  name: string;
  parentId: string;
  level: number;
  tangoPath: string;
}

/** Crea un subrubro debajo de un nodo de Tango (hasta nivel 4), marcado como pendiente de cargar en Tango. */
export async function createSubrubro(
  parentId: string,
  rawName: string,
  actorName: string | null
): Promise<{ ok: true; node: CreatedRubro } | { ok: false; error: string }> {
  const parent = await prisma.category.findUnique({
    where: { id: parentId },
    select: { id: true, tangoPath: true, level: true, isActive: true, children: { select: { name: true, tangoPath: true } } },
  });
  const siblings = (parent?.children ?? []).flatMap((c) => [c.name, c.tangoPath?.split(" > ").pop() ?? ""]).filter(Boolean);
  const check = checkNewSubrubro(parent, rawName, siblings);
  if (!check.ok) return check;
  const taken = await prisma.category.findUnique({ where: { tangoPath: check.path }, select: { id: true } });
  if (taken) return { ok: false, error: "Ya existe un rubro con esa ruta." };
  const baseSlug = `t-${check.path
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 170)}`;
  const slugTaken = await prisma.category.findUnique({ where: { slug: baseSlug }, select: { id: true } });
  const slug = slugTaken ? `${baseSlug}-${Date.now().toString(36)}` : baseSlug;
  const node = await prisma.category.create({
    data: {
      name: tangoDisplayName(check.name),
      slug,
      tangoPath: check.path,
      level: check.level,
      parentId,
      pendingTango: true,
      createdInAppBy: actorName,
      createdInAppAt: new Date(),
    },
    select: { id: true, name: true, level: true, tangoPath: true },
  });
  resetCategoryAncestorsCache();
  return { ok: true, node: { id: node.id, name: node.name, parentId, level: node.level ?? check.level, tangoPath: node.tangoPath! } };
}
