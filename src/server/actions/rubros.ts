"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { isUncategorizedCategory } from "@/lib/tango-only";
import { tangoPathLabel } from "@/lib/tango-tree";
import { createSubrubro, type CreatedRubro } from "@/server/categories/rubros";

/** «Crear subrubro acá» del selector de rubros: solo admin y quien gestiona el catálogo (categories.manage). */
export async function createSubrubroAction(
  parentId: string,
  name: string
): Promise<{ ok: true; node: CreatedRubro } | { ok: false; error: string }> {
  const { user } = await requireStaff("categories.manage");
  if (typeof parentId !== "string" || typeof name !== "string") return { ok: false, error: "Datos inválidos." };
  try {
    const result = await createSubrubro(parentId, name, user.name ?? user.email ?? null);
    if (result.ok) revalidatePath("/admin/categories");
    return result;
  } catch (err) {
    console.error("createSubrubroAction", err);
    return { ok: false, error: "No se pudo crear el subrubro. Probá de nuevo." };
  }
}

export interface DescribedCategory {
  id: string;
  label: string;
  /** old = categoría vieja fuera del árbol; inactive = nodo de Tango desactivado; uncategorized = «Sin categorizar». */
  state: "tango" | "old" | "inactive" | "uncategorized" | "missing";
}

/** Para mostrar en el selector un rubro que el dato tiene y no está en el árbol activo (viejo, inactivo o «Sin categorizar»). */
export async function describeCategoriesAction(ids: string[]): Promise<DescribedCategory[]> {
  await requireStaff();
  const unique = [...new Set((Array.isArray(ids) ? ids : []).filter((id) => typeof id === "string" && id))].slice(0, 200);
  if (!unique.length) return [];
  const rows = await prisma.category.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true, slug: true, tangoPath: true, isActive: true },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return unique.map((id) => {
    const row = byId.get(id);
    if (!row) return { id, label: "Rubro borrado", state: "missing" as const };
    if (isUncategorizedCategory(row)) return { id, label: row.name, state: "uncategorized" as const };
    if (!row.tangoPath) return { id, label: row.name, state: "old" as const };
    return { id, label: tangoPathLabel(row.tangoPath), state: row.isActive ? ("tango" as const) : ("inactive" as const) };
  });
}
