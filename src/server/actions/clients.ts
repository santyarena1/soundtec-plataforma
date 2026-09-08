"use server";
import bcrypt from "bcryptjs";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { logClientActivity } from "@/server/crm/activity";
export type ActionResult = { ok: boolean; error?: string; id?: string; password?: string };
const val = (f: FormData, k: string) => String(f.get(k) || "").trim() || null;
const opt = (n: number) => z.string().trim().max(n).optional().nullable();
const err = (e: unknown) => (e instanceof Error ? e.message : "No pudimos completar la operación.");
const refresh = (id: string) => {
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
};
const password = () => `ST!${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
const schema = z.object({
  id: z.string().optional(),
  companyName: z.string().trim().min(2, "Ingresá la razón social.").max(200),
  tradeName: opt(200),
  taxId: opt(30),
  website: opt(300),
  address: opt(500),
  city: opt(100),
  province: opt(100),
  country: opt(100),
  segment: opt(80),
  source: opt(80),
  ownerId: opt(100),
  notes: opt(5000),
  assignedPriceListId: opt(100),
  tags: z.array(z.string().max(60)),
  isActive: z.boolean(),
});
function input(f: FormData) {
  return {
    id: val(f, "id") || undefined,
    companyName: f.get("companyName"),
    tradeName: val(f, "tradeName"),
    taxId: val(f, "taxId"),
    website: val(f, "website"),
    address: val(f, "address"),
    city: val(f, "city"),
    province: val(f, "province"),
    country: val(f, "country") || "Argentina",
    segment: val(f, "segment"),
    source: val(f, "source"),
    ownerId: val(f, "ownerId"),
    notes: val(f, "notes"),
    assignedPriceListId: val(f, "assignedPriceListId"),
    tags: String(f.get("tags") || "")
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean),
    isActive: f.get("isActive") !== "false" && f.get("isActive") !== null,
  };
}
/** Opción {id, name} de un cliente, para selectores que agregan clientes al vuelo. */
export async function getClientOption(id: string): Promise<{ id: string; name: string } | null> {
  await requireAdmin();
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, companyName: true, tradeName: true },
  });
  if (!client) return null;
  return {
    id: client.id,
    name: client.tradeName ? `${client.companyName} (${client.tradeName})` : client.companyName,
  };
}

export async function createClient(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = schema.safeParse(input(f));
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const name = val(f, "contactName"),
    email = val(f, "contactEmail")?.toLowerCase(),
    withUser = f.get("createPortalUser") === "on" || f.get("createPortalUser") === "true",
    pwd = withUser ? val(f, "password") || password() : null;
  if (withUser && (!name || !email))
    return { ok: false, error: "Para crear el acceso, completá nombre y email del contacto." };
  if (pwd && pwd.length < 8)
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  try {
    const id = await prisma.$transaction(async (tx) => {
      if (email && withUser && (await tx.user.findUnique({ where: { email } })))
        throw new Error("Ya existe un usuario con ese email.");
      const { id: _, ...data } = p.data;
      const c = await tx.client.create({ data });
      if (name)
        await tx.clientContact.create({
          data: {
            clientId: c.id,
            name,
            role: val(f, "contactRole"),
            email,
            phone: val(f, "contactPhone"),
            whatsapp: val(f, "contactWhatsapp"),
            isPrimary: true,
          },
        });
      if (withUser && name && email && pwd)
        await tx.user.create({
          data: {
            name,
            email,
            passwordHash: await bcrypt.hash(pwd, 12),
            role: "CLIENT",
            clientId: c.id,
            companyName: c.companyName,
          },
        });
      return c.id;
    });
    refresh(id);
    revalidatePath("/admin/users");
    return { ok: true, id, ...(withUser ? { password: pwd! } : {}) };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function updateClient(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = schema.safeParse(input(f));
  if (!p.success || !p.data.id)
    return { ok: false, error: p.success ? "Falta el cliente." : p.error.issues[0]?.message };
  try {
    const { id, ...data } = p.data;
    await prisma.client.update({ where: { id }, data });
    refresh(id);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
/** Borra un cliente sin historial comercial (pedidos, cotizaciones, movimientos). */
export async function deleteClient(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el cliente." };
  const c = await prisma.client.findUnique({
    where: { id },
    select: { _count: { select: { requests: true, quotes: true, accountMovements: true } } },
  });
  if (!c) return { ok: false, error: "El cliente no existe." };
  const history = c._count.requests + c._count.quotes + c._count.accountMovements;
  if (history > 0) {
    return {
      ok: false,
      error: "Este cliente tiene pedidos, cotizaciones o movimientos. Desactivalo en vez de eliminarlo.",
    };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { clientId: id, role: "CLIENT" } });
    await tx.client.delete({ where: { id } });
  });
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return { ok: true, id };
}

export async function toggleClientActive(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id");
  if (!id) return { ok: false, error: "Falta el cliente." };
  const c = await prisma.client.findUnique({ where: { id }, select: { isActive: true } });
  if (!c) return { ok: false, error: "El cliente no existe." };
  await prisma.client.update({ where: { id }, data: { isActive: !c.isActive } });
  refresh(id);
  return { ok: true, id };
}
const contact = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1),
  name: z.string().trim().min(2, "Ingresá el nombre."),
  role: opt(100),
  email: z.string().email("Ingresá un email válido.").optional().nullable().or(z.literal("")),
  phone: opt(60),
  whatsapp: opt(60),
  notes: opt(1000),
  isPrimary: z.boolean(),
});
export async function upsertClientContact(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = contact.safeParse({
    id: val(f, "id") || undefined,
    clientId: f.get("clientId"),
    name: f.get("name"),
    role: val(f, "role"),
    email: val(f, "email"),
    phone: val(f, "phone"),
    whatsapp: val(f, "whatsapp"),
    notes: val(f, "notes"),
    isPrimary: f.get("isPrimary") === "on" || f.get("isPrimary") === "true",
  });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  try {
    const { id, isPrimary, ...data } = p.data;
    const row = await prisma.$transaction(async (tx) => {
      if (isPrimary)
        await tx.clientContact.updateMany({
          where: { clientId: data.clientId },
          data: { isPrimary: false },
        });
      return id
        ? tx.clientContact.update({ where: { id }, data: { ...data, isPrimary } })
        : tx.clientContact.create({ data: { ...data, isPrimary } });
    });
    refresh(data.clientId);
    return { ok: true, id: row.id };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function deleteClientContact(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id || !clientId) return { ok: false, error: "Falta el contacto." };
  try {
    await prisma.clientContact.delete({ where: { id } });
    refresh(clientId);
    return { ok: true, id };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function setPrimaryContact(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id || !clientId) return { ok: false, error: "Falta el contacto." };
  await prisma.$transaction([
    prisma.clientContact.updateMany({ where: { clientId }, data: { isPrimary: false } }),
    prisma.clientContact.update({ where: { id }, data: { isPrimary: true } }),
  ]);
  refresh(clientId);
  return { ok: true, id };
}
export async function ensurePrimaryContact(clientId: string): Promise<ActionResult> {
  await requireAdmin();
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { contactName: true, email: true, phone: true, _count: { select: { contacts: true } } },
  });
  if (!c) return { ok: false, error: "El cliente no existe." };
  if (c._count.contacts || (!c.contactName && !c.email && !c.phone))
    return { ok: true, id: clientId };
  await prisma.clientContact.create({
    data: {
      clientId,
      name: c.contactName || c.email || "Contacto principal",
      email: c.email,
      phone: c.phone,
      isPrimary: true,
    },
  });
  refresh(clientId);
  return { ok: true, id: clientId };
}
const activity = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["NOTE", "CALL", "MEETING", "EMAIL", "WHATSAPP", "TASK"]),
  title: z.string().trim().min(2, "Ingresá un título."),
  body: opt(5000),
  dueAt: opt(50),
});
export async function createClientActivity(f: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const p = activity.safeParse({
    clientId: f.get("clientId"),
    kind: f.get("kind"),
    title: f.get("title"),
    body: val(f, "body"),
    dueAt: val(f, "dueAt"),
  });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  try {
    const row = await logClientActivity({
      ...p.data,
      dueAt: p.data.dueAt ? new Date(p.data.dueAt) : null,
      createdById: admin.id,
    });
    refresh(p.data.clientId);
    return { ok: true, id: row?.id };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function completeClientActivity(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id || !clientId) return { ok: false, error: "Falta la actividad." };
  const row = await prisma.clientActivity.findUnique({ where: { id }, select: { doneAt: true } });
  if (!row) return { ok: false, error: "La actividad no existe." };
  await prisma.clientActivity.update({
    where: { id },
    data: { doneAt: row.doneAt ? null : new Date() },
  });
  refresh(clientId);
  return { ok: true, id };
}
export async function deleteClientActivity(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id || !clientId) return { ok: false, error: "Falta la actividad." };
  await prisma.clientActivity.delete({ where: { id } });
  refresh(clientId);
  return { ok: true, id };
}
export async function createPortalUserForClient(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const clientId = val(f, "clientId"),
    name = val(f, "name"),
    email = val(f, "email")?.toLowerCase();
  if (!clientId || !name || !email)
    return { ok: false, error: "Completá cliente, nombre y email." };
  if (!z.string().email().safeParse(email).success)
    return { ok: false, error: "Ingresá un email válido." };
  if (await prisma.user.findUnique({ where: { email } }))
    return { ok: false, error: "Ya existe un usuario con ese email." };
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { companyName: true },
  });
  if (!client) return { ok: false, error: "El cliente no existe." };
  const pwd = val(f, "password") || password();
  if (pwd.length < 8)
    return { ok: false, error: "La contraseña debe tener al menos 8 caracteres." };
  const user = await prisma.user.create({
    data: {
      clientId,
      name,
      email,
      passwordHash: await bcrypt.hash(pwd, 12),
      role: "CLIENT",
      companyName: client.companyName,
    },
  });
  refresh(clientId);
  revalidatePath("/admin/users");
  return { ok: true, id: user.id, password: pwd };
}
export async function resetPortalUserPassword(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id) return { ok: false, error: "Falta el usuario." };
  const pwd = password();
  try {
    await prisma.user.update({
      where: { id, role: "CLIENT" },
      data: { passwordHash: await bcrypt.hash(pwd, 12) },
    });
    if (clientId) refresh(clientId);
    return { ok: true, id, password: pwd };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}
export async function togglePortalUserActive(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id) return { ok: false, error: "Falta el usuario." };
  const user = await prisma.user.findUnique({
    where: { id },
    select: { isActive: true, role: true },
  });
  if (!user || user.role !== "CLIENT")
    return { ok: false, error: "El usuario de portal no existe." };
  await prisma.user.update({ where: { id }, data: { isActive: !user.isActive } });
  if (clientId) refresh(clientId);
  return { ok: true, id };
}
const movement = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["DEBIT", "CREDIT"]),
  concept: z.string().trim().min(2),
  amountUsd: z.coerce.number().positive(),
  dueDate: opt(50),
  notes: opt(1000),
  referenceType: opt(30),
  referenceId: opt(100),
});
export async function createClientAccountMovement(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const p = movement.safeParse({
    clientId: f.get("clientId"),
    kind: f.get("kind"),
    concept: f.get("concept"),
    amountUsd: f.get("amountUsd"),
    dueDate: val(f, "dueDate"),
    notes: val(f, "notes"),
    referenceType: val(f, "referenceType"),
    referenceId: val(f, "referenceId"),
  });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  const row = await prisma.accountMovement.create({
    data: { ...p.data, dueDate: p.data.dueDate ? new Date(p.data.dueDate) : null },
  });
  await logClientActivity({
    clientId: p.data.clientId,
    title: `Movimiento de cuenta: ${p.data.concept}`,
    referenceType: "MOVEMENT",
    referenceId: row.id,
  });
  refresh(p.data.clientId);
  return { ok: true, id: row.id };
}
export async function toggleClientMovementPaid(f: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  if (!id || !clientId) return { ok: false, error: "Falta el movimiento." };
  const row = await prisma.accountMovement.findUnique({ where: { id }, select: { paidAt: true } });
  if (!row) return { ok: false, error: "El movimiento no existe." };
  await prisma.accountMovement.update({
    where: { id },
    data: { paidAt: row.paidAt ? null : new Date() },
  });
  refresh(clientId);
  return { ok: true, id };
}
export const upsertClient = async (f: FormData) =>
  val(f, "id") ? updateClient(f) : createClient(f);
export const createPortalUser = createPortalUserForClient;
