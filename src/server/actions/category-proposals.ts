"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import {
  approveBranchSuggestion,
  rejectBranchSuggestion,
  approveProposals,
  deactivateEmptyLegacyCategories,
  loadTangoProposals,
  rejectProposals,
  undoProposal,
} from "@/server/category-proposals";

type Result = { ok: boolean; error?: string; message?: string };
const PAGE = "/admin/products/reclasificacion";
const ids = z.array(z.string().min(1)).min(1).max(5000);

function done(message: string): Result {
  revalidatePath(PAGE);
  revalidatePath("/admin/products");
  return { ok: true, message };
}

export async function loadTangoProposalsAction(): Promise<Result> {
  await requireStaff("categories.manage");
  try {
    const r = await loadTangoProposals();
    return done(`Árbol listo (${r.nodes} rubros) · ${r.created} propuestas nuevas${r.skipped ? ` · ${r.skipped} ya estaban o el producto no existe` : ""}${r.branches ? ` · ${r.branches} rubros nuevos sugeridos` : ""}.`);
  } catch (error) {
    console.error("loadTangoProposals", error);
    return { ok: false, error: "No se pudieron cargar las propuestas. Probá de nuevo; si sigue, avisame." };
  }
}

export async function approveAllHighAction(): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const n = await approveProposals({ confidence: "alta" }, user.id);
  const off = await deactivateEmptyLegacyCategories();
  return done(`${n} productos pasaron a su rubro de Tango.${off ? ` ${off} categorías viejas quedaron vacías y se desactivaron.` : ""}`);
}

export async function approveProposalsAction(input: { ids: string[] }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const parsed = ids.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: "No hay propuestas elegidas." };
  const n = await approveProposals({ ids: parsed.data }, user.id);
  await deactivateEmptyLegacyCategories();
  return done(n === 1 ? "Aprobada." : `${n} aprobadas.`);
}

/** Aprobar con otro rubro elegido a mano. */
export async function approveWithCategoryAction(input: { id: string; categoryId: string }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const node = await prisma.category.findUnique({ where: { id: input.categoryId }, select: { tangoPath: true } });
  if (!node?.tangoPath) return { ok: false, error: "Elegí un rubro del árbol de Tango." };
  const n = await approveProposals({ ids: [input.id] }, user.id, node.tangoPath);
  await deactivateEmptyLegacyCategories();
  return n ? done("Aprobada con el rubro elegido.") : { ok: false, error: "Esa propuesta ya no está pendiente." };
}

export async function rejectProposalsAction(input: { ids: string[] }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const parsed = ids.safeParse(input.ids);
  if (!parsed.success) return { ok: false, error: "No hay propuestas elegidas." };
  const n = await rejectProposals(parsed.data, user.id);
  return done(n === 1 ? "Rechazada: el producto queda como estaba." : `${n} rechazadas.`);
}

export async function undoProposalAction(input: { id: string }): Promise<Result> {
  await requireStaff("categories.manage");
  return (await undoProposal(input.id)) ? done("Deshecho: volvió a quedar pendiente.") : { ok: false, error: "No se pudo deshacer." };
}

export async function approveBranchAction(input: { id: string }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  const r = await approveBranchSuggestion(input.id, user.id);
  if (!r) return { ok: false, error: "Esa rama ya no está pendiente." };
  return done(`Rubro creado. ${r.pending} propuestas pendientes pasaron a ese rubro (quedan para aprobar)${r.moved ? ` y ${r.moved} productos ya aprobados se movieron` : ""}.`);
}

export async function rejectBranchAction(input: { id: string }): Promise<Result> {
  const { user } = await requireStaff("categories.manage");
  return (await rejectBranchSuggestion(input.id, user.id)) ? done("Descartada: no se crea ese rubro.") : { ok: false, error: "Esa rama ya no está pendiente." };
}
