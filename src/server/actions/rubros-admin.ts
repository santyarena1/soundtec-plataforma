"use server";

/**
 * Pantalla «Rubros» (/admin/categories): acciones por nodo (renombrar, ocultar
 * a clientes, mover productos, unir, desactivar), pendientes en Tango y
 * equivalencias proveedor → rubro. Todo exige categories.manage.
 */
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { tangoDisplayName, tangoPathLabel } from "@/lib/tango-tree";
import { normalizeRubroName, rubroKey } from "@/lib/rubros";
import { DEFAULT_HIDDEN_TANGO_PATHS, resetCustomerHiddenCache } from "@/lib/customer-hidden-categories";
import { EQUIVALENCE_SOURCES, equivalenceKey } from "@/lib/category-equivalence";
import { validateRubroIds } from "@/server/categories/rubros";
import { moveProductsToRubro, moveReviewMessage } from "@/server/categories/move";
import { suggestEquivalencesFromProducts } from "@/server/categories/equivalences";
import { simulateOperation } from "@/server/price-review/engine";
import { applyAndRecord, proposePriceReview } from "@/server/price-review/reviews";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

async function catalogActor() {
  const { user } = await requireStaff("categories.manage");
  return { id: user.id, name: user.name ?? user.email ?? null };
}

function refreshRubros() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/portal/products");
  revalidatePath("/catalogo");
}

function errorText(err: unknown, fallback: string) {
  return err instanceof Error && err.message.length < 200 && !/prisma|invocation/i.test(err.message) ? err.message : fallback;
}

export interface RubroDetail {
  id: string;
  path: string;
  level: number;
  own: number;
  total: number;
  hidden: boolean;
  inheritedHidden: boolean;
  pendingTango: boolean;
  createdInAppBy: string | null;
  createdInAppAt: string | null;
  activeChildren: number;
  brands: Array<{ name: string; count: number }>;
  rules: number;
}

export async function getRubroDetailAction(id: string): Promise<Result<{ detail: RubroDetail }>> {
  await catalogActor();
  const node = await prisma.category.findUnique({
    where: { id },
    select: { id: true, tangoPath: true, level: true, hiddenFromCustomers: true, pendingTango: true, createdInAppBy: true, createdInAppAt: true },
  });
  if (!node?.tangoPath) return { ok: false, error: "Ese rubro no está en el árbol." };
  const path = node.tangoPath;
  const subtree = await prisma.category.findMany({
    where: { OR: [{ id }, { tangoPath: { startsWith: `${path} > ` } }] },
    select: { id: true, isActive: true },
  });
  const ids = subtree.map((c) => c.id);
  const parts = path.split(" > ");
  const ancestorPaths = parts.slice(0, -1).map((_, i) => parts.slice(0, i + 1).join(" > "));
  const [own, total, brandRows, margins, discounts, hiddenAncestors] = await Promise.all([
    prisma.product.count({ where: { isActive: true, categoryId: id } }),
    prisma.product.count({ where: { isActive: true, categoryId: { in: ids } } }),
    prisma.product.groupBy({
      by: ["brandId"],
      where: { isActive: true, categoryId: { in: ids } },
      _count: { _all: true },
      orderBy: { _count: { brandId: "desc" } },
      take: 8,
    }),
    prisma.marginRule.count({ where: { scopeType: "CATEGORY", scopeId: id } }),
    prisma.discountRule.count({ where: { scopeType: "CATEGORY", scopeId: id } }),
    ancestorPaths.length ? prisma.category.count({ where: { tangoPath: { in: ancestorPaths }, hiddenFromCustomers: true } }) : Promise.resolve(0),
  ]);
  const brandIds = brandRows.map((b) => b.brandId).filter((x): x is string => Boolean(x));
  const brandNames = new Map((await prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } })).map((b) => [b.id, b.name]));
  return {
    ok: true,
    detail: {
      id,
      path: tangoPathLabel(path),
      level: node.level ?? parts.length,
      own,
      total,
      hidden: node.hiddenFromCustomers,
      inheritedHidden: hiddenAncestors > 0,
      pendingTango: node.pendingTango,
      createdInAppBy: node.createdInAppBy,
      createdInAppAt: node.createdInAppAt?.toISOString() ?? null,
      activeChildren: subtree.filter((c) => c.id !== id && c.isActive).length,
      brands: brandRows.map((b) => ({ name: b.brandId ? brandNames.get(b.brandId) ?? "—" : "Sin marca", count: b._count._all })),
      rules: margins + discounts,
    },
  };
}

/** Renombrar: cambia el nombre y la ruta propia y la de todo lo que cuelga. Queda marcado para cambiarlo también en Tango. */
export async function renameRubroAction(id: string, rawName: string): Promise<Result> {
  const actor = await catalogActor();
  const node = await prisma.category.findUnique({ where: { id }, select: { tangoPath: true, parentId: true } });
  if (!node?.tangoPath) return { ok: false, error: "Ese rubro no está en el árbol." };
  const name = normalizeRubroName(String(rawName ?? ""));
  if (name.length < 2 || name.length > 60) return { ok: false, error: "Escribí un nombre de 2 a 60 letras." };
  const oldPath = node.tangoPath;
  const newPath = [...oldPath.split(" > ").slice(0, -1), name].join(" > ");
  if (newPath === oldPath) return { ok: true };
  const siblings = await prisma.category.findMany({
    where: { parentId: node.parentId, id: { not: id }, tangoPath: { not: null } },
    select: { tangoPath: true },
  });
  if (siblings.some((s) => rubroKey(s.tangoPath!.split(" > ").pop() ?? "") === rubroKey(name))) {
    return { ok: false, error: "Ya hay un rubro con ese nombre en el mismo lugar. Para juntarlos usá «Unir con…»." };
  }
  const descendants = await prisma.category.findMany({ where: { tangoPath: { startsWith: `${oldPath} > ` } }, select: { id: true, tangoPath: true } });
  await prisma.$transaction([
    prisma.category.update({ where: { id }, data: { name: tangoDisplayName(name), tangoPath: newPath, pendingTango: true, createdInAppBy: actor.name } }),
    ...descendants.map((d) => prisma.category.update({ where: { id: d.id }, data: { tangoPath: `${newPath}${d.tangoPath!.slice(oldPath.length)}` } })),
  ]);
  refreshRubros();
  return { ok: true };
}

/** Ocultar / mostrar a clientes (con todo lo que cuelga). */
export async function setRubroHiddenAction(id: string, hidden: boolean): Promise<Result> {
  await catalogActor();
  const node = await prisma.category.findUnique({ where: { id }, select: { tangoPath: true } });
  if (!node?.tangoPath) return { ok: false, error: "Ese rubro no está en el árbol." };
  // La primera vez que se marca uno, se marcan también los de siempre (Indumentaria y Servicios) para que no aparezcan de golpe.
  if ((await prisma.category.count({ where: { hiddenFromCustomers: true } })) === 0) {
    await prisma.category.updateMany({ where: { tangoPath: { in: DEFAULT_HIDDEN_TANGO_PATHS } }, data: { hiddenFromCustomers: true } });
  }
  await prisma.category.update({ where: { id }, data: { hiddenFromCustomers: Boolean(hidden) } });
  resetCustomerHiddenCache();
  refreshRubros();
  return { ok: true };
}

/** Desactivar: solo si no tiene productos ni subrubros activos. */
export async function deactivateRubroAction(id: string): Promise<Result> {
  await catalogActor();
  const node = await prisma.category.findUnique({ where: { id }, select: { tangoPath: true } });
  if (!node?.tangoPath) return { ok: false, error: "Ese rubro no está en el árbol." };
  const [children, products] = await Promise.all([
    prisma.category.count({ where: { parentId: id, isActive: true } }),
    prisma.product.count({ where: { categoryId: id } }),
  ]);
  if (children) return { ok: false, error: "Tiene subrubros activos: desactivalos o unilos primero." };
  if (products) return { ok: false, error: `Tiene ${products} producto${products === 1 ? "" : "s"} (activos o no): movelos a otro rubro primero.` };
  await prisma.category.update({ where: { id }, data: { isActive: false } });
  refreshRubros();
  return { ok: true };
}

export type RubroMoveResult = Result<{ applied: boolean; reviewId?: string; message: string }>;

/** Mover los productos propios del rubro (no los de sus subrubros) a otro rubro. */
export async function moveRubroProductsAction(fromId: string, toId: string): Promise<RubroMoveResult> {
  const actor = await catalogActor();
  if (fromId === toId) return { ok: false, error: "Elegí otro rubro." };
  const products = await prisma.product.findMany({ where: { categoryId: fromId }, select: { id: true } });
  if (!products.length) return { ok: false, error: "Ese rubro no tiene productos propios." };
  try {
    const result = await moveProductsToRubro(products.map((p) => p.id), toId, actor, `Mover ${products.length} productos de rubro`);
    if (!result.ok) return result;
    refreshRubros();
    if (!result.applied) return { ok: true, applied: false, reviewId: result.reviewId, message: moveReviewMessage(result) };
    return { ok: true, applied: true, message: `Listo: ${result.moved} productos pasaron al otro rubro.` };
  } catch (err) {
    return { ok: false, error: errorText(err, "No se pudieron mover.") };
  }
}

/** Unir con otro rubro: pasa productos, reglas de compatibilidad, servicios y equivalencias, y desactiva el de origen. */
export async function mergeRubroAction(fromId: string, toId: string): Promise<RubroMoveResult> {
  const actor = await catalogActor();
  if (fromId === toId) return { ok: false, error: "Elegí otro rubro." };
  const valid = await validateRubroIds(prisma, [toId]);
  if (!valid.ok) return valid;
  const [from, to] = await Promise.all([
    prisma.category.findUnique({ where: { id: fromId }, select: { tangoPath: true } }),
    prisma.category.findUnique({ where: { id: toId }, select: { tangoPath: true } }),
  ]);
  if (!from?.tangoPath) return { ok: false, error: "Ese rubro no está en el árbol." };
  const op = { type: "category.merge" as const, fromId, toId };
  const title = `Unir ${tangoPathLabel(from.tangoPath)} con ${tangoPathLabel(to?.tangoPath ?? "")}`;
  try {
    const sim = await simulateOperation(op);
    if (sim.summary.affectedProducts > 0) {
      const review = await proposePriceReview(op, title, actor);
      revalidatePath("/admin/price-reviews");
      return {
        ok: true,
        applied: false,
        reviewId: review.id,
        message: `Unir estos rubros mueve el precio de ${review.affectedProducts} productos (hay reglas por rubro): quedó en Precios › Revisión de cambios.`,
      };
    }
    await applyAndRecord(op, title, actor);
  } catch (err) {
    return { ok: false, error: errorText(err, "No se pudo unir.") };
  }
  refreshRubros();
  return { ok: true, applied: true, message: "Listo: se unieron y el rubro de origen quedó desactivado." };
}

/** Pendientes en Tango: marcar que ya se cargó allá. */
export async function markTangoLoadedAction(id: string): Promise<Result> {
  await catalogActor();
  await prisma.category.update({ where: { id }, data: { pendingTango: false } });
  revalidatePath("/admin/categories");
  return { ok: true };
}

// --- Equivalencias -------------------------------------------------------------

export async function saveEquivalenceAction(input: {
  id?: string;
  source: string;
  brandId?: string | null;
  sourcePath: string;
  categoryId: string;
}): Promise<Result> {
  const actor = await catalogActor();
  if (!(EQUIVALENCE_SOURCES as readonly string[]).includes(input.source)) return { ok: false, error: "Fuente inválida." };
  const sourceKey = equivalenceKey(input.sourcePath);
  if (!sourceKey) return { ok: false, error: "Escribí la categoría o ruta tal como la trae el proveedor." };
  const valid = await validateRubroIds(prisma, [input.categoryId]);
  if (!valid.ok) return valid;
  const data = {
    source: input.source,
    brandKey: input.brandId ?? "",
    sourceKey,
    sourceLabel: input.sourcePath.trim().slice(0, 300),
    categoryId: input.categoryId,
    status: "ACTIVE",
    createdBy: actor.name,
  };
  try {
    if (input.id) await prisma.categoryEquivalence.update({ where: { id: input.id }, data });
    else
      await prisma.categoryEquivalence.upsert({
        where: { source_brandKey_sourceKey: { source: data.source, brandKey: data.brandKey, sourceKey } },
        create: data,
        update: data,
      });
  } catch {
    return { ok: false, error: "Ya hay una equivalencia para esa fuente, marca y ruta." };
  }
  revalidatePath("/admin/categories");
  return { ok: true };
}

export async function confirmEquivalenceAction(id: string): Promise<Result> {
  await catalogActor();
  await prisma.categoryEquivalence.update({ where: { id }, data: { status: "ACTIVE" } });
  revalidatePath("/admin/categories");
  return { ok: true };
}

export async function deleteEquivalenceAction(id: string): Promise<Result> {
  await catalogActor();
  await prisma.categoryEquivalence.deleteMany({ where: { id } });
  revalidatePath("/admin/categories");
  return { ok: true };
}

/** Sugerir equivalencias a partir de productos ya ubicados (≥90 % al mismo rubro y al menos 3 productos). */
export async function suggestEquivalencesAction(): Promise<Result<{ created: number; skipped: number }>> {
  const actor = await catalogActor();
  const r = await suggestEquivalencesFromProducts(prisma, { apply: true, createdBy: `sugerida (${actor.name ?? "sistema"})` });
  revalidatePath("/admin/categories");
  return { ok: true, created: r.created, skipped: r.skipped };
}
