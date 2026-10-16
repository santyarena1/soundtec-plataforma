"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { ALL_SCOPES, PERMISSION_GROUPS, canSeeCosts, type PermissionScope, type Permissions } from "@/lib/permissions";

type Result = { ok: true; id: string } | { ok: false; error: string };

const PORTAL_SCOPES = new Set<string>(PERMISSION_GROUPS.filter((g) => g.portal).flatMap((g) => g.items.map((i) => i.scope)));

const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Poné un nombre de al menos 2 letras.").max(80),
  description: z.string().trim().max(2000).optional().nullable(),
  /** STAFF = equipo interno (panel); CLIENT = usuarios del portal de un cliente. */
  baseSystemRole: z.enum(["STAFF", "CLIENT"]),
  permissions: z.object({
    scopes: z.array(z.string()).max(200),
    priceAccess: z.enum(["full", "sale", "none"]),
  }),
  isActive: z.boolean().optional(),
});

const refresh = () => {
  revalidatePath("/admin/settings/roles");
  revalidatePath("/admin/users");
};

/**
 * Crea o edita un rol. Los permisos llegan como checkboxes (nunca JSON crudo).
 * Seguridad: nadie puede crear un rol con más permisos de los que tiene, y
 * solo quien ve costos puede dar acceso a costos.
 */
export async function upsertCustomRoleVisual(input: {
  id?: string;
  name: string;
  description?: string | null;
  baseSystemRole: "STAFF" | "CLIENT";
  permissions: { scopes: string[]; priceAccess: "full" | "sale" | "none" };
  isActive?: boolean;
}): Promise<Result> {
  const { permissions: actorPerms, isAdmin } = await requireStaff("roles.manage");
  const parsed = roleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  const data = parsed.data;

  const valid = new Set<string>(ALL_SCOPES);
  const scopes = [...new Set(data.permissions.scopes)].filter((s) => valid.has(s)) as PermissionScope[];
  // Un rol de cliente solo lleva permisos del portal; uno del equipo, solo del panel.
  const cleanScopes = scopes.filter((s) => (data.baseSystemRole === "CLIENT" ? PORTAL_SCOPES.has(s) : !PORTAL_SCOPES.has(s)));
  if (!isAdmin) {
    const extra = cleanScopes.filter((s) => !actorPerms.scopes.includes(s));
    if (extra.length) return { ok: false, error: "No podés dar permisos que vos no tenés." };
    if (data.permissions.priceAccess === "full" && !canSeeCosts(actorPerms)) return { ok: false, error: "No podés dar acceso a costos." };
  }
  const permissions: Permissions = {
    scopes: cleanScopes,
    priceAccess: data.baseSystemRole === "CLIENT" ? "sale" : data.permissions.priceAccess,
  };

  const existingName = await prisma.customRole.findFirst({
    where: { name: { equals: data.name, mode: "insensitive" }, ...(data.id ? { NOT: { id: data.id } } : {}) },
    select: { id: true },
  });
  if (existingName) return { ok: false, error: "Ya hay un rol con ese nombre." };

  const row = {
    name: data.name,
    description: data.description || null,
    baseSystemRole: data.baseSystemRole,
    permissionsJson: permissions as unknown as Prisma.InputJsonValue,
    isActive: data.isActive ?? true,
  };
  try {
    const saved = data.id
      ? await prisma.customRole.update({ where: { id: data.id }, data: row, select: { id: true } })
      : await prisma.customRole.create({ data: row, select: { id: true } });
    refresh();
    return { ok: true, id: saved.id };
  } catch (error) {
    console.error("[roles] no se pudo guardar", error);
    return { ok: false, error: "No se pudo guardar el rol." };
  }
}

/** Duplicar un rol para armar uno parecido. */
export async function duplicateCustomRole(id: string): Promise<Result> {
  await requireStaff("roles.manage");
  const role = await prisma.customRole.findUnique({ where: { id } });
  if (!role) return { ok: false, error: "El rol no existe." };
  let name = `${role.name} (copia)`;
  for (let i = 2; await prisma.customRole.findFirst({ where: { name }, select: { id: true } }); i++) name = `${role.name} (copia ${i})`;
  const copy = await prisma.customRole.create({
    data: {
      name,
      description: role.description,
      baseSystemRole: role.baseSystemRole,
      permissionsJson: (role.permissionsJson ?? Prisma.JsonNull) as Prisma.InputJsonValue,
    },
    select: { id: true },
  });
  refresh();
  return { ok: true, id: copy.id };
}

/**
 * Activar / desactivar. Un rol desactivado deja a sus usuarios del equipo
 * solo con el inicio del panel (no se borran permisos ni usuarios).
 */
export async function toggleCustomRoleActive(id: string): Promise<Result> {
  await requireStaff("roles.manage");
  const role = await prisma.customRole.findUnique({ where: { id }, select: { isActive: true } });
  if (!role) return { ok: false, error: "El rol no existe." };
  await prisma.customRole.update({ where: { id }, data: { isActive: !role.isActive } });
  refresh();
  return { ok: true, id };
}

/** Eliminar: solo si nadie lo usa. */
export async function deleteCustomRole(id: string): Promise<Result> {
  await requireStaff("roles.manage");
  const role = await prisma.customRole.findUnique({ where: { id }, select: { _count: { select: { users: true } } } });
  if (!role) return { ok: false, error: "El rol no existe." };
  if (role._count.users) return { ok: false, error: `Lo usan ${role._count.users} usuario(s). Asignales otro rol o desactivalo.` };
  await prisma.customRole.delete({ where: { id } });
  refresh();
  return { ok: true, id };
}
