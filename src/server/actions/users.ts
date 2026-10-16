"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { UserRole } from "@prisma/client";
import { requireStaff, type CurrentUser } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { canSeeCosts, canSeeSalePrices, isAdminRole, parsePermissions, permissionsHave, type Permissions } from "@/lib/permissions";
import { issueAccess, parseAccessMode, unusablePasswordHash, type AccessResult } from "@/server/user-access";

export type UserActionResult = { ok: boolean; error?: string; id?: string; access?: AccessResult };

const ROLES = ["CLIENT", "STAFF", "ADMIN", "SUPER_ADMIN"] as const;

const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;

const refresh = (id?: string, clientId?: string | null) => {
  revalidatePath("/admin/users");
  if (id) revalidatePath(`/admin/users/${id}`);
  if (clientId) revalidatePath(`/admin/clients/${clientId}`);
};

const schema = z
  .object({
    id: z.string().optional(),
    name: z.string().trim().min(2, "Ingresá el nombre y apellido.").max(120),
    email: z.string().trim().toLowerCase().email("Ingresá un email válido."),
    role: z.enum(ROLES, { errorMap: () => ({ message: "Elegí el tipo de usuario." }) }),
    clientId: z.string().nullable(),
    customRoleId: z.string().nullable(),
    phone: z.string().max(60).nullable(),
    quoteSignName: z.string().max(160).nullable(),
    quoteSignTitle: z.string().max(160).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.role === "CLIENT" && !v.clientId) ctx.addIssue({ code: "custom", message: "Elegí la empresa (cliente) a la que pertenece.", path: ["clientId"] });
    if (v.role === "STAFF" && !v.customRoleId) ctx.addIssue({ code: "custom", message: "Elegí el rol del usuario del equipo (ej. Vendedor).", path: ["customRoleId"] });
  });

function input(f: FormData) {
  return {
    id: val(f, "id") ?? undefined,
    name: String(f.get("name") ?? ""),
    email: String(f.get("email") ?? ""),
    role: f.get("role"),
    clientId: val(f, "clientId"),
    customRoleId: val(f, "customRoleId"),
    phone: val(f, "phone"),
    quoteSignName: val(f, "quoteSignName"),
    quoteSignTitle: val(f, "quoteSignTitle"),
  };
}

/**
 * Quién puede tocar a quién:
 * - un super admin, a cualquiera;
 * - un admin, a todos menos a los super admin (y no puede crear super admins);
 * - el equipo con "Crear y editar usuarios", solo a equipo y clientes.
 */
function canManageRole(actor: CurrentUser, role: UserRole, actorPerms: Permissions): boolean {
  if (actor.role === "SUPER_ADMIN") return true;
  if (actor.role === "ADMIN") return role !== "SUPER_ADMIN";
  // Sin «Crear y editar usuarios» (ej. un vendedor con «Dar acceso al portal»): solo accesos de clientes.
  if (!permissionsHave(actorPerms, "users.manage")) return role === "CLIENT";
  return role === "STAFF" || role === "CLIENT";
}

/** Quien no ve todos los clientes solo da accesos a empresas que tiene a cargo. */
async function canTouchClient(actor: CurrentUser, actorPerms: Permissions, clientId: string | null): Promise<boolean> {
  if (isAdminRole(actor.role) || permissionsHave(actorPerms, "clients.view_all")) return true;
  if (!clientId) return false;
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { ownerId: true } });
  return client?.ownerId === actor.id;
}

async function assertCanManageUser(
  actor: CurrentUser,
  actorPerms: Permissions,
  targetId: string
): Promise<{ role: UserRole; email: string; name: string; clientId: string | null } | string> {
  const target = await prisma.user.findUnique({
    where: { id: targetId },
    select: { role: true, email: true, name: true, clientId: true, customRole: { select: { permissionsJson: true } } },
  });
  if (!target) return "El usuario no existe.";
  if (!canManageRole(actor, target.role, actorPerms)) {
    return target.role === "SUPER_ADMIN" ? "Solo un super administrador puede modificar a otro super administrador." : "No tenés permiso para modificar a este usuario.";
  }
  // Alguien del equipo no puede tocar (ni resetearle la clave) a otro con más permisos que los suyos.
  if (!isAdminRole(actor.role) && target.role === "STAFF" && target.customRole) {
    const perms = parsePermissions(target.customRole.permissionsJson);
    const higher =
      perms.scopes.some((s) => !actorPerms.scopes.includes(s)) ||
      (perms.priceAccess === "full" && !canSeeCosts(actorPerms)) ||
      (perms.priceAccess === "sale" && !canSeeSalePrices(actorPerms));
    if (higher) return "Este usuario tiene más permisos que vos: lo modifica un administrador.";
  }
  if (target.role === "CLIENT" && !(await canTouchClient(actor, actorPerms, target.clientId))) return "Este usuario es de una empresa a cargo de otra persona.";
  return { role: target.role, email: target.email, name: target.name, clientId: target.clientId };
}

async function validate(f: FormData, actor: CurrentUser, actorPerms: Permissions) {
  const parsed = schema.safeParse(input(f));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  const data = parsed.data;
  if (!canManageRole(actor, data.role, actorPerms)) {
    return {
      error:
        data.role === "SUPER_ADMIN"
          ? "Solo un super administrador puede asignar ese tipo."
          : !permissionsHave(actorPerms, "users.manage")
            ? "Tu rol solo permite dar accesos al portal a clientes."
            : "Solo un administrador puede crear administradores.",
    };
  }
  if (data.role === "CLIENT" && !(await canTouchClient(actor, actorPerms, data.clientId))) {
    return { error: "Esa empresa está a cargo de otra persona." };
  }
  const [client, role] = await Promise.all([
    data.role === "CLIENT" && data.clientId ? prisma.client.findUnique({ where: { id: data.clientId }, select: { companyName: true } }) : null,
    data.customRoleId ? prisma.customRole.findUnique({ where: { id: data.customRoleId }, select: { baseSystemRole: true, isActive: true, permissionsJson: true } }) : null,
  ]);
  if (data.role === "CLIENT" && !client) return { error: "La empresa seleccionada no existe." };
  if (data.customRoleId && (!role || !role.isActive)) return { error: "El rol seleccionado no existe o está desactivado." };
  // Un rol del equipo no se puede dar a un cliente ni al revés.
  if (role && data.role === "CLIENT" && role.baseSystemRole !== "CLIENT") return { error: "Ese rol es para el equipo interno, no para clientes del portal." };
  if (role && data.role === "STAFF" && role.baseSystemRole === "CLIENT") return { error: "Ese rol es para clientes del portal, no para el equipo." };
  // Quien no es admin no puede asignar un rol con más permisos (o más acceso a precios) que los suyos.
  if (role && data.role === "STAFF" && !isAdminRole(actor.role)) {
    const target = parsePermissions(role.permissionsJson);
    if (target.scopes.some((s) => !actorPerms.scopes.includes(s))) return { error: "No podés asignar un rol con permisos que vos no tenés." };
    if (target.priceAccess === "full" && !canSeeCosts(actorPerms)) return { error: "No podés asignar un rol con acceso a costos." };
    if (target.priceAccess === "sale" && !canSeeSalePrices(actorPerms)) return { error: "No podés asignar un rol que ve precios." };
  }
  return {
    data: {
      ...data,
      clientId: data.role === "CLIENT" ? data.clientId : null,
      companyName: data.role === "CLIENT" ? client?.companyName ?? null : null,
      // Los administradores tienen acceso total: un rol no los limita.
      customRoleId: isAdminRole(data.role) ? null : data.customRoleId,
    },
  };
}

export async function createUser(f: FormData): Promise<UserActionResult> {
  const { user: actor, permissions: actorPerms } = await requireStaff(["users.manage", "clients.portal_users"]);
  const checked = await validate(f, actor, actorPerms);
  if (!checked.data) return { ok: false, error: checked.error };
  const { id: _id, ...data } = checked.data;
  if (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } })) {
    return { ok: false, error: "Ya existe un usuario con ese email." };
  }
  try {
    const user = await prisma.user.create({
      data: { ...data, passwordHash: await unusablePasswordHash(), createdById: actor.id },
      select: { id: true, email: true, name: true, clientId: true, role: true },
    });
    const access = await issueAccess(user, parseAccessMode(f.get("accessMode")), user.role === "CLIENT" ? "portal" : "staff");
    refresh(user.id, user.clientId);
    return { ok: true, id: user.id, access };
  } catch (e) {
    console.error("[usuarios] no se pudo crear", e);
    return { ok: false, error: "No pudimos crear el usuario. Probá de nuevo." };
  }
}

export async function updateUser(f: FormData): Promise<UserActionResult> {
  const { user: actor, permissions: actorPerms } = await requireStaff(["users.manage", "clients.portal_users"]);
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  const target = await assertCanManageUser(actor, actorPerms, id);
  if (typeof target === "string") return { ok: false, error: target };
  const checked = await validate(f, actor, actorPerms);
  if (!checked.data) return { ok: false, error: checked.error };
  const { id: _id, ...data } = checked.data;
  if (id === actor.id && data.role !== actor.role) return { ok: false, error: "No podés cambiar tu propio tipo de usuario." };
  if (data.email !== target.email && (await prisma.user.findUnique({ where: { email: data.email }, select: { id: true } }))) {
    return { ok: false, error: "Ya existe otro usuario con ese email." };
  }
  try {
    const current = await prisma.user.findUnique({ where: { id }, select: { role: true, customRoleId: true, email: true } });
    // Cambiar tipo, rol o email cierra sus sesiones abiertas (entra de nuevo con los permisos nuevos).
    const accessChanged = current?.role !== data.role || current?.customRoleId !== data.customRoleId || current?.email !== data.email;
    await prisma.user.update({
      where: { id },
      data: { ...data, ...(accessChanged ? { sessionVersion: { increment: 1 } } : {}) },
    });
    refresh(id, data.clientId ?? target.clientId);
    return { ok: true, id };
  } catch (e) {
    console.error("[usuarios] no se pudo guardar", e);
    return { ok: false, error: "No pudimos guardar el usuario." };
  }
}

/** Nuevo acceso: invitación por mail o clave temporal. Cierra sus sesiones abiertas. */
export async function resetUserPassword(f: FormData): Promise<UserActionResult> {
  const { user: actor, permissions: actorPerms } = await requireStaff(["users.manage", "clients.portal_users"]);
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  if (id === actor.id) return { ok: false, error: "Tu propia clave la cambiás desde «Cambiar mi clave»." };
  const target = await assertCanManageUser(actor, actorPerms, id);
  if (typeof target === "string") return { ok: false, error: target };
  const access = await issueAccess({ id, email: target.email, name: target.name }, parseAccessMode(f.get("accessMode")), target.role === "CLIENT" ? "portal" : "staff");
  refresh(id);
  return { ok: true, id, access };
}

export async function toggleUserActive(f: FormData): Promise<UserActionResult> {
  const { user: actor, permissions: actorPerms } = await requireStaff(["users.manage", "clients.portal_users"]);
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  if (id === actor.id) return { ok: false, error: "No podés desactivar tu propio usuario." };
  const target = await assertCanManageUser(actor, actorPerms, id);
  if (typeof target === "string") return { ok: false, error: target };
  const row = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
  if (!row) return { ok: false, error: "El usuario no existe." };
  await prisma.$transaction([
    // Al desactivar: se cierran sus sesiones y se anulan los links de activación pendientes.
    prisma.user.update({ where: { id }, data: { isActive: !row.isActive, sessionVersion: { increment: 1 } } }),
    ...(row.isActive ? [prisma.accountActivationToken.deleteMany({ where: { userId: id, usedAt: null } })] : []),
  ]);
  refresh(id, target.clientId);
  return { ok: true, id };
}

export async function deleteUser(f: FormData): Promise<UserActionResult> {
  const { user: actor, permissions: actorPerms } = await requireStaff(["users.manage", "clients.portal_users"]);
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  if (id === actor.id) return { ok: false, error: "No podés eliminar tu propio usuario." };
  const target = await assertCanManageUser(actor, actorPerms, id);
  if (typeof target === "string") return { ok: false, error: target };
  const row = await prisma.user.findUnique({
    where: { id },
    select: { _count: { select: { requests: true, ownedQuotes: true, ownedClients: true } } },
  });
  if (!row) return { ok: false, error: "El usuario no existe." };
  if (row._count.requests || row._count.ownedQuotes || row._count.ownedClients) {
    return { ok: false, error: "Tiene pedidos, cotizaciones o clientes a cargo. Desactivalo para conservar el historial." };
  }
  await prisma.user.delete({ where: { id } });
  refresh(undefined, target.clientId);
  return { ok: true, id };
}
