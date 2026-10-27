"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { approveProposals, deactivateEmptyLegacyCategories, rejectProposals, removeBranch, undoProposal } from "@/server/category-proposals";

type Result = { ok: boolean; error?: string; message?: string };
const PAGE = "/admin/products/reclasificacion";
const ids = z.array(z.string().min(1)).min(1).max(5000);

function done(message: string): Result {
  revalidatePath(PAGE);
  revalidatePath("/admin/products");
  return { ok: true, message };
}

/** Paso 1: todos los seguros de una vez. */
export async function approveAllHighAction(): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const n = await approveProposals({ confidence: "alta" }, user.id);
  await deactivateEmptyLegacyCategories();
  return done(`Listo: ${n.toLocaleString("es-AR")} productos pasaron a su rubro.`);
}

/** «Está bien»: el producto pasa al rubro propuesto. */
export async function approveProposalsAction(input: { ids: string[] }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const parsed = ids.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: "No hay nada elegido." };
  const n = await approveProposals({ ids: parsed.data }, user.id);
  await deactivateEmptyLegacyCategories();
  return done(n === 1 ? "Listo." : `${n} listos.`);
}

/** «Va en otro rubro»: pasa al rubro elegido. */
export async function approveWithCategoryAction(input: { id: string; categoryId: string }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const node = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { tangoPath: true } });
  if (!node?.tangoPath) return { ok: false, error: "Elegí un rubro de la lista." };
  const n = await approveProposals({ ids: [input.id] }, user.id, node.tangoPath);
  await deactivateEmptyLegacyCategories();
  return n ? done("Listo, quedó en el rubro elegido.") : { ok: false, error: "Ese producto ya estaba decidido." };
}

/** «Dejarlo como está»: no se toca el producto. */
export async function rejectProposalsAction(input: { ids: string[] }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const parsed = ids.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: "No hay nada elegido." };
  const n = await rejectProposals(parsed.data, user.id);
  return done(n === 1 ? "Quedó como estaba." : `${n} quedaron como estaban.`);
}

export async function undoProposalAction(input: { id: string }): Promise<Result> {
  await requireStaff("categories.manage");
  return (await undoProposal(input.id)) ? done("Deshecho: volvió a la lista para revisar.") : { ok: false, error: "No se pudo deshacer." };
}

/** Quitar un rubro nuevo: sus productos vuelven a la ruta original de Tango. */
export async function removeBranchAction(input: { id: string }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  return (await removeBranch(input.id, user.id)) ? done("Rubro quitado: sus productos usan el rubro original de Tango.") : { ok: false, error: "No se pudo quitar." };
}
