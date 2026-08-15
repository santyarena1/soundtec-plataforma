"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import type { Permissions, PermissionScope } from "@/lib/permissions";

const roleSchema = z.object({
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional().nullable(),
  baseSystemRole: z.enum(["SUPER_ADMIN", "ADMIN", "CLIENT"]).default("CLIENT"),
  permissionsJson: z.string().max(10000).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertCustomRole(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = roleSchema.safeParse({
    name: formData.get("name"),
    description: formData.get("description") || null,
    baseSystemRole: formData.get("baseSystemRole") || "CLIENT",
    permissionsJson: formData.get("permissionsJson") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  if (parsed.data.baseSystemRole === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") return;

  let permissions: Prisma.InputJsonValue | typeof Prisma.JsonNull = Prisma.JsonNull;
  if (parsed.data.permissionsJson) {
    try {
      permissions = JSON.parse(parsed.data.permissionsJson) as Prisma.InputJsonValue;
    } catch {
      permissions = { raw: parsed.data.permissionsJson } as Prisma.InputJsonValue;
    }
  }

  const data = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    baseSystemRole: parsed.data.baseSystemRole,
    permissionsJson: permissions,
    isActive: parsed.data.isActive ?? true,
  };

  if (id) {
    await prisma.customRole.update({ where: { id }, data });
  } else {
    await prisma.customRole.create({ data });
  }
  revalidatePath("/admin/users");
}

const permissionsObjectSchema = z.object({
  scopes: z.array(z.string()).default([]),
  fullAccess: z.boolean().optional(),
  hidePrices: z.boolean().optional(),
});

const visualRoleSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(2).max(80),
  description: z.string().max(2000).optional().nullable(),
  baseSystemRole: z.enum(["SUPER_ADMIN", "ADMIN", "CLIENT"]),
  permissions: permissionsObjectSchema,
  isActive: z.boolean().optional(),
});

/**
 * Versión "visual" del upsert: recibe el objeto Permissions ya estructurado
 * desde la UI con checkboxes (sin JSON crudo). El cliente nunca tipea JSON.
 */
export async function upsertCustomRoleVisual(input: {
  id?: string;
  name: string;
  description?: string | null;
  baseSystemRole: "SUPER_ADMIN" | "ADMIN" | "CLIENT";
  permissions: Permissions;
  isActive?: boolean;
}): Promise<{ ok: boolean; id?: string }> {
  const admin = await requireAdmin();
  const parsed = visualRoleSchema.safeParse(input);
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Datos inválidos");
  if (parsed.data.baseSystemRole === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") {
    throw new Error("No tenés permisos para asignar rol Super administrador.");
  }

  const permissions = {
    scopes: parsed.data.permissions.scopes as PermissionScope[],
    fullAccess: parsed.data.permissions.fullAccess ?? false,
    hidePrices: parsed.data.permissions.hidePrices ?? false,
  };

  const data = {
    name: parsed.data.name,
    description: parsed.data.description || null,
    baseSystemRole: parsed.data.baseSystemRole,
    permissionsJson: permissions as unknown as Prisma.InputJsonValue,
    isActive: parsed.data.isActive ?? true,
  };

  if (parsed.data.id) {
    await prisma.customRole.update({ where: { id: parsed.data.id }, data });
  } else {
    await prisma.customRole.create({ data });
  }
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function toggleCustomRoleActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const role = await prisma.customRole.findUnique({ where: { id } });
  if (!role) return;
  await prisma.customRole.update({
    where: { id },
    data: { isActive: !role.isActive },
  });
  revalidatePath("/admin/users");
}

const updateUserFullSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(120).optional().nullable(),
  role: z.enum(["SUPER_ADMIN", "ADMIN", "CLIENT"]),
  customRoleId: z.string().optional().nullable(),
  clientId: z.string().optional().nullable(),
  companyName: z.string().max(160).optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  quoteSignName: z.string().max(160).optional().nullable(),
  quoteSignTitle: z.string().max(160).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function updateUserFull(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = updateUserFullSchema.safeParse({
    id: formData.get("id"),
    name: formData.get("name"),
    email: String(formData.get("email") || "").toLowerCase(),
    password: formData.get("password") || null,
    role: formData.get("role"),
    customRoleId: formData.get("customRoleId") || null,
    clientId: formData.get("clientId") || null,
    companyName: formData.get("companyName") || null,
    phone: formData.get("phone") || null,
    quoteSignName: formData.get("quoteSignName") || null,
    quoteSignTitle: formData.get("quoteSignTitle") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;
  if (parsed.data.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN") return;

  const data: {
    name: string;
    email: string;
    role: "SUPER_ADMIN" | "ADMIN" | "CLIENT";
    customRoleId: string | null;
    clientId: string | null;
    companyName: string | null;
    phone: string | null;
    quoteSignName: string | null;
    quoteSignTitle: string | null;
    isActive: boolean;
    passwordHash?: string;
  } = {
    name: parsed.data.name,
    email: parsed.data.email,
    role: parsed.data.role,
    customRoleId: parsed.data.customRoleId || null,
    clientId: parsed.data.role === "CLIENT" ? parsed.data.clientId || null : null,
    companyName: parsed.data.companyName || null,
    phone: parsed.data.phone || null,
    quoteSignName: parsed.data.quoteSignName || null,
    quoteSignTitle: parsed.data.quoteSignTitle || null,
    isActive: parsed.data.isActive ?? true,
  };

  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 12);
  }

  await prisma.user.update({
    where: { id: parsed.data.id },
    data,
  });

  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${parsed.data.id}`);
}
