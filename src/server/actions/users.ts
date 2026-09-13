"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
export type UserActionResult = { ok: boolean; error?: string; id?: string; password?: string };
const val = (f: FormData, k: string) => String(f.get(k) || "").trim() || null;
const generated = () => `ST!${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const refresh = (id?: string) => {
  revalidatePath("/admin/users");
  if (id) revalidatePath(`/admin/users/${id}`);
};
const schema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Ingresá el nombre."),
  email: z.string().trim().email("Ingresá un email válido."),
  role: z.enum(["CLIENT", "ADMIN", "SUPER_ADMIN"]),
  clientId: z.string().optional().nullable(),
  customRoleId: z.string().optional().nullable(),
  phone: z.string().max(60).optional().nullable(),
  quoteSignName: z.string().max(160).optional().nullable(),
  quoteSignTitle: z.string().max(160).optional().nullable(),
  isActive: z.boolean(),
});
function input(f: FormData) {
  return {
    id: val(f, "id") || undefined,
    name: f.get("name"),
    email: String(f.get("email") || "")
      .toLowerCase()
      .trim(),
    role: f.get("role"),
    clientId: val(f, "clientId"),
    customRoleId: val(f, "customRoleId"),
    phone: val(f, "phone"),
    quoteSignName: val(f, "quoteSignName"),
    quoteSignTitle: val(f, "quoteSignTitle"),
    isActive: f.get("isActive") !== "false" && f.get("isActive") !== null,
  };
}
async function validate(f: FormData) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse(input(f));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  if (parsed.data.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN")
    return { error: "Solo un super administrador puede asignar ese rol." };
  if (parsed.data.role === "CLIENT" && !parsed.data.clientId)
    return { error: "Elegí el cliente al que pertenece este usuario." };
  const client = parsed.data.clientId
    ? await prisma.client.findUnique({
        where: { id: parsed.data.clientId },
        select: { companyName: true },
      })
    : null;
  if (parsed.data.role === "CLIENT" && !client)
    return { error: "El cliente seleccionado no existe." };
  return { data: parsed.data, companyName: client?.companyName || null };
}
export async function createUser(f: FormData): Promise<UserActionResult> {
  const checked = await validate(f);
  if (!checked.data) return { ok: false, error: checked.error };
  const mode = val(f, "passwordMode") || "generate",
    pwd = mode === "write" ? val(f, "password") : generated();
  if (!pwd || pwd.length < 8)
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  if (await prisma.user.findUnique({ where: { email: checked.data.email } }))
    return { ok: false, error: "Ya existe un usuario con ese email." };
  try {
    const { id: _, ...data } = checked.data;
    const user = await prisma.user.create({
      data: {
        ...data,
        clientId: data.role === "CLIENT" ? data.clientId : null,
        companyName: data.role === "CLIENT" ? checked.companyName : null,
        passwordHash: await bcrypt.hash(pwd, 12),
      },
    });
    refresh(user.id);
    if (user.clientId) revalidatePath(`/admin/clients/${user.clientId}`);
    return { ok: true, id: user.id, ...(mode === "generate" ? { password: pwd } : {}) };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No pudimos crear el usuario." };
  }
}
export async function updateUser(f: FormData): Promise<UserActionResult> {
  const checked = await validate(f);
  if (!checked.data?.id) return { ok: false, error: checked.error || "Falta el usuario." };
  try {
    const { id, ...data } = checked.data;
    await prisma.user.update({
      where: { id },
      data: {
        ...data,
        clientId: data.role === "CLIENT" ? data.clientId : null,
        companyName: data.role === "CLIENT" ? checked.companyName : null,
      },
    });
    refresh(id);
    if (data.clientId) revalidatePath(`/admin/clients/${data.clientId}`);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "No pudimos guardar el usuario." };
  }
}
export async function resetUserPassword(f: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  const pwd = generated();
  try {
    await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(pwd, 12) } });
    refresh(id);
    return { ok: true, id, password: pwd };
  } catch {
    return { ok: false, error: "El usuario no existe." };
  }
}
export async function toggleUserActive(f: FormData): Promise<UserActionResult> {
  await requireAdmin();
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  const row = await prisma.user.findUnique({ where: { id }, select: { isActive: true } });
  if (!row) return { ok: false, error: "El usuario no existe." };
  await prisma.user.update({ where: { id }, data: { isActive: !row.isActive } });
  refresh(id);
  return { ok: true, id };
}
export async function deleteUser(f: FormData): Promise<UserActionResult> {
  const admin = await requireAdmin();
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el usuario." };
  if (id === admin.id) return { ok: false, error: "No podés eliminar tu propio usuario." };
  const row = await prisma.user.findUnique({
    where: { id },
    select: { role: true, _count: { select: { requests: true, ownedQuotes: true } } },
  });
  if (!row) return { ok: false, error: "El usuario no existe." };
  if (row.role === "SUPER_ADMIN" && admin.role !== "SUPER_ADMIN")
    return { ok: false, error: "Solo un super administrador puede eliminar este usuario." };
  if (row._count.requests || row._count.ownedQuotes)
    return {
      ok: false,
      error:
        "Este usuario tiene pedidos o cotizaciones. Podés desactivarlo para conservar el historial.",
    };
  await prisma.user.delete({ where: { id } });
  refresh();
  return { ok: true, id };
}
