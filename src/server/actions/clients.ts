"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { permissionsHave } from "@/lib/permissions";
import { cuitVariants, formatCuit, isValidCuit } from "@/lib/expo/cuit";
import { logClientActivity } from "@/server/crm/activity";
import { canAccessClient, seesAllClients, staffForClient } from "@/server/clients/access";
import { clientDiscountSchema, replaceClientDiscounts, type ClientDiscountInput } from "@/server/clients/conditions";
import { issueAccess, parseAccessMode, unusablePasswordHash, type AccessMode, type AccessResult } from "@/server/user-access";

export type ActionResult = { ok: boolean; error?: string; id?: string; access?: AccessResult };
export type CreatedAccess = { name: string; email: string; access: AccessResult };

const val = (f: FormData, k: string) => String(f.get(k) ?? "").trim() || null;
const opt = (n: number) => z.string().trim().max(n).optional().nullable();
const refresh = (id: string) => {
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
};

// ─── Empresa ────────────────────────────────────────────────────────────────

const companySchema = z.object({
  companyName: z.string().trim().min(2, "Ingresá la razón social.").max(200),
  tradeName: opt(200),
  taxId: opt(30),
  taxCondition: opt(60),
  segment: opt(80),
  source: opt(80),
  website: opt(300),
  ownerId: opt(64),
  tags: z.array(z.string().trim().max(60)).max(30).default([]),
  address: opt(500),
  city: opt(100),
  province: opt(100),
  postalCode: opt(20),
  country: opt(100),
  notes: opt(5000),
});

const commercialSchema = z.object({
  paymentTerms: opt(200),
  creditLimitUsd: z.number().min(0).max(100_000_000).nullable().optional(),
  assignedPriceListId: opt(64),
  discounts: z.array(clientDiscountSchema).max(50).default([]),
});

const contactSchema = z.object({
  name: z.string().trim().min(2, "Cada contacto necesita nombre.").max(160),
  role: opt(100),
  email: z.string().trim().toLowerCase().email("Hay un email de contacto inválido.").max(200).nullable().optional().or(z.literal("").transform(() => null)),
  phone: opt(60),
  whatsapp: opt(60),
  notes: opt(1000),
  isPrimary: z.boolean().default(false),
  /** Crearle usuario del portal (requiere email). */
  portalAccess: z.boolean().default(false),
});

const createSchema = z.object({
  company: companySchema,
  commercial: commercialSchema.optional(),
  contacts: z.array(contactSchema).max(30).default([]),
  accessMode: z.enum(["invite", "temporary"]).default("invite"),
});

export type ClientCreateInput = z.input<typeof createSchema>;
export type ClientUpdateInput = { id: string; company: z.input<typeof companySchema>; commercial?: z.input<typeof commercialSchema> };

/** CUIT válido (o vacío) y formateado. */
function cleanTaxId(raw: string | null | undefined): { value: string | null } | { error: string } {
  if (!raw?.trim()) return { value: null };
  if (!isValidCuit(raw)) return { error: "El CUIT no es válido (revisá los 11 dígitos)." };
  return { value: formatCuit(raw) };
}

async function duplicateByCuit(taxId: string | null, exceptId?: string): Promise<{ id: string; companyName: string } | null> {
  if (!taxId) return null;
  return prisma.client.findFirst({
    where: { taxId: { in: cuitVariants(taxId) }, ...(exceptId ? { NOT: { id: exceptId } } : {}) },
    select: { id: true, companyName: true },
  });
}

async function taxonomyNames(discounts: ClientDiscountInput[]) {
  const brandIds = discounts.filter((d) => d.target === "BRAND" && d.targetId).map((d) => d.targetId!);
  const categoryIds = discounts.filter((d) => d.target === "CATEGORY" && d.targetId).map((d) => d.targetId!);
  const [brands, categories] = await Promise.all([
    brandIds.length ? prisma.brand.findMany({ where: { id: { in: brandIds } }, select: { id: true, name: true } }) : [],
    categoryIds.length ? prisma.category.findMany({ where: { id: { in: categoryIds } }, select: { id: true, name: true } }) : [],
  ]);
  return { brands: new Map(brands.map((b) => [b.id, b.name])), categories: new Map(categories.map((c) => [c.id, c.name])) };
}

function companyData(c: z.output<typeof companySchema>, taxId: string | null) {
  return {
    companyName: c.companyName,
    tradeName: c.tradeName || null,
    taxId,
    taxCondition: c.taxCondition || null,
    segment: c.segment || null,
    source: c.source || null,
    website: c.website || null,
    tags: [...new Set(c.tags.filter(Boolean))],
    address: c.address || null,
    city: c.city || null,
    province: c.province || null,
    postalCode: c.postalCode || null,
    country: c.country || "Argentina",
    notes: c.notes || null,
  };
}

/**
 * Alta completa de un cliente en un solo paso: empresa, dirección,
 * contactos (con acceso al portal si se pide), condiciones comerciales y
 * descuentos. Cada parte respeta los permisos del rol.
 */
export async function createClientFull(input: ClientCreateInput): Promise<{ ok: true; id: string; accesses: CreatedAccess[] } | { ok: false; error: string }> {
  const ctx = await requireStaff("clients.create");
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Revisá los datos." };
  const { company, commercial, contacts, accessMode } = parsed.data;
  const canCommercial = permissionsHave(ctx.permissions, "clients.commercial");
  const canPortal = permissionsHave(ctx.permissions, "clients.portal_users");

  const tax = cleanTaxId(company.taxId);
  if ("error" in tax) return { ok: false, error: tax.error };
  const dup = await duplicateByCuit(tax.value);
  if (dup) return { ok: false, error: `Ya existe un cliente con ese CUIT: ${dup.companyName}.` };

  const withAccess = canPortal ? contacts.filter((c) => c.portalAccess) : [];
  if (withAccess.some((c) => !c.email)) return { ok: false, error: "Para darle acceso al portal a un contacto, cargale el email." };
  const emails = withAccess.map((c) => c.email!);
  if (new Set(emails).size !== emails.length) return { ok: false, error: "Hay dos contactos con acceso y el mismo email." };
  if (emails.length) {
    const taken = await prisma.user.findFirst({ where: { email: { in: emails } }, select: { email: true } });
    if (taken) return { ok: false, error: `Ya existe un usuario con el email ${taken.email}.` };
  }

  // Sin «Ver todos los clientes», el cliente queda a cargo de quien lo crea.
  const ownerId = seesAllClients(ctx.permissions) ? company.ownerId || ctx.user.id : ctx.user.id;
  const discounts = canCommercial ? commercial?.discounts ?? [] : [];
  const names = await taxonomyNames(discounts);
  const primaryIndex = Math.max(0, contacts.findIndex((c) => c.isPrimary));
  const hash = await unusablePasswordHash();

  try {
    const { clientId, users } = await prisma.$transaction(async (tx) => {
      const client = await tx.client.create({
        data: {
          ...companyData(company, tax.value),
          ownerId,
          ...(canCommercial && commercial
            ? {
                paymentTerms: commercial.paymentTerms || null,
                creditLimitUsd: commercial.creditLimitUsd ?? null,
                assignedPriceListId: commercial.assignedPriceListId || null,
              }
            : {}),
          // Datos del contacto principal también en la empresa (búsquedas y documentos).
          contactName: contacts[primaryIndex]?.name ?? null,
          email: contacts[primaryIndex]?.email ?? null,
          phone: contacts[primaryIndex]?.phone ?? contacts[primaryIndex]?.whatsapp ?? null,
          lastActivityAt: new Date(),
        },
        select: { id: true, companyName: true },
      });
      if (contacts.length) {
        await tx.clientContact.createMany({
          data: contacts.map((c, i) => ({
            clientId: client.id,
            name: c.name,
            role: c.role || null,
            email: c.email || null,
            phone: c.phone || null,
            whatsapp: c.whatsapp || null,
            notes: c.notes || null,
            isPrimary: i === primaryIndex,
          })),
        });
      }
      if (discounts.length) await replaceClientDiscounts(tx, client.id, client.companyName, discounts, names);
      const users = [];
      for (const c of withAccess) {
        users.push(
          await tx.user.create({
            data: { name: c.name, email: c.email!, phone: c.phone || c.whatsapp || null, role: "CLIENT", clientId: client.id, companyName: client.companyName, passwordHash: hash, createdById: ctx.user.id },
            select: { id: true, name: true, email: true },
          })
        );
      }
      return { clientId: client.id, users };
    });

    const accesses: CreatedAccess[] = [];
    for (const u of users) accesses.push({ name: u.name, email: u.email, access: await issueAccess(u, accessMode, "portal") });
    await logClientActivity({ clientId, kind: "SYSTEM", title: "Cliente creado", createdById: ctx.user.id }).catch(() => null);
    refresh(clientId);
    if (users.length) revalidatePath("/admin/users");
    return { ok: true, id: clientId, accesses };
  } catch (e) {
    console.error("[clientes] no se pudo crear", e);
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { ok: false, error: "Ya existe un usuario con alguno de esos emails." };
    return { ok: false, error: "No pudimos crear el cliente. Probá de nuevo." };
  }
}

/** Edición de empresa y (con permiso) condiciones comerciales y descuentos de la ficha. */
export async function updateClientFull(input: ClientUpdateInput): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const access = await staffForClient(input.id, "clients.edit");
  if ("error" in access) return { ok: false, error: access.error };
  const { ctx } = access;
  const company = companySchema.safeParse(input.company);
  if (!company.success) return { ok: false, error: company.error.issues[0]?.message ?? "Revisá los datos." };
  const commercialParsed = input.commercial ? commercialSchema.safeParse(input.commercial) : null;
  if (commercialParsed && !commercialParsed.success) return { ok: false, error: commercialParsed.error.issues[0]?.message ?? "Revisá las condiciones." };
  const canCommercial = permissionsHave(ctx.permissions, "clients.commercial");

  const tax = cleanTaxId(company.data.taxId);
  if ("error" in tax) return { ok: false, error: tax.error };
  const dup = await duplicateByCuit(tax.value, input.id);
  if (dup) return { ok: false, error: `Ya existe otro cliente con ese CUIT: ${dup.companyName}.` };

  const commercial = canCommercial && commercialParsed?.success ? commercialParsed.data : null;
  const names = commercial ? await taxonomyNames(commercial.discounts) : null;
  try {
    await prisma.$transaction(async (tx) => {
      const updated = await tx.client.update({
        where: { id: input.id },
        data: {
          ...companyData(company.data, tax.value),
          // Cambiar el responsable requiere ver todos los clientes (si no, se lo «sacaría» a sí mismo).
          ...(seesAllClients(ctx.permissions) && company.data.ownerId ? { ownerId: company.data.ownerId } : {}),
          ...(commercial
            ? {
                paymentTerms: commercial.paymentTerms || null,
                creditLimitUsd: commercial.creditLimitUsd ?? null,
                assignedPriceListId: commercial.assignedPriceListId || null,
              }
            : {}),
        },
        select: { companyName: true },
      });
      if (commercial && names) await replaceClientDiscounts(tx, input.id, updated.companyName, commercial.discounts, names);
      // El nombre de la empresa se muestra en los usuarios del portal.
      await tx.user.updateMany({ where: { clientId: input.id, role: "CLIENT" }, data: { companyName: updated.companyName } });
    });
    refresh(input.id);
    return { ok: true, id: input.id };
  } catch (e) {
    console.error("[clientes] no se pudo guardar", e);
    return { ok: false, error: "No pudimos guardar el cliente." };
  }
}

/** Opción {id, name} de un cliente, para selectores que agregan clientes al vuelo. */
export async function getClientOption(id: string): Promise<{ id: string; name: string } | null> {
  const ctx = await requireStaff(["clients.view", "clients.view_all", "quotes.create"]);
  if (!(await canAccessClient(ctx, id)) && !permissionsHave(ctx.permissions, "quotes.create")) return null;
  const client = await prisma.client.findUnique({ where: { id }, select: { id: true, companyName: true, tradeName: true } });
  if (!client) return null;
  return { id: client.id, name: client.tradeName ? `${client.companyName} (${client.tradeName})` : client.companyName };
}

/**
 * Alta rápida desde un modal (ej. al cotizar): razón social, CUIT y un
 * contacto, con acceso al portal opcional. El resto se completa en la ficha.
 */
export async function createClient(f: FormData): Promise<ActionResult> {
  const result = await createClientFull({
    company: {
      companyName: String(f.get("companyName") ?? ""),
      tradeName: val(f, "tradeName"),
      taxId: val(f, "taxId"),
      taxCondition: val(f, "taxCondition"),
      segment: val(f, "segment"),
      ownerId: val(f, "ownerId"),
      tags: [],
    },
    contacts: val(f, "contactName")
      ? [
          {
            name: val(f, "contactName")!,
            role: val(f, "contactRole"),
            email: val(f, "contactEmail"),
            phone: val(f, "contactPhone"),
            whatsapp: val(f, "contactWhatsapp"),
            isPrimary: true,
            portalAccess: f.get("createPortalUser") === "on" || f.get("createPortalUser") === "true",
          },
        ]
      : [],
    accessMode: parseAccessMode(f.get("accessMode")),
  });
  if (!result.ok) return { ok: false, error: result.error };
  return { ok: true, id: result.id, access: result.accesses[0]?.access };
}

/** Borra un cliente sin historial comercial (pedidos, cotizaciones, movimientos). */
export async function deleteClient(f: FormData): Promise<ActionResult> {
  const id = val(f, "id");
  const access = await staffForClient(id, "clients.delete");
  if ("error" in access) return { ok: false, error: access.error };
  const c = await prisma.client.findUnique({
    where: { id: id! },
    select: { _count: { select: { requests: true, quotes: true, accountMovements: true } } },
  });
  if (!c) return { ok: false, error: "El cliente no existe." };
  if (c._count.requests + c._count.quotes + c._count.accountMovements > 0) {
    return { ok: false, error: "Este cliente tiene pedidos, cotizaciones o movimientos. Desactivalo en vez de eliminarlo." };
  }
  await prisma.$transaction(async (tx) => {
    await tx.user.deleteMany({ where: { clientId: id!, role: "CLIENT" } });
    await tx.client.delete({ where: { id: id! } });
  });
  revalidatePath("/admin/clients");
  revalidatePath("/admin");
  return { ok: true, id: id! };
}

export async function toggleClientActive(f: FormData): Promise<ActionResult> {
  const id = val(f, "id");
  const access = await staffForClient(id, "clients.edit");
  if ("error" in access) return { ok: false, error: access.error };
  const c = await prisma.client.findUnique({ where: { id: id! }, select: { isActive: true } });
  if (!c) return { ok: false, error: "El cliente no existe." };
  await prisma.$transaction([
    prisma.client.update({ where: { id: id! }, data: { isActive: !c.isActive } }),
    // Empresa desactivada: sus usuarios del portal quedan afuera (y se cierran sus sesiones).
    ...(c.isActive
      ? [prisma.user.updateMany({ where: { clientId: id!, role: "CLIENT", isActive: true }, data: { isActive: false, sessionVersion: { increment: 1 } } })]
      : []),
  ]);
  refresh(id!);
  revalidatePath("/admin/users");
  return { ok: true, id: id! };
}

// ─── Contactos ──────────────────────────────────────────────────────────────

const contactForm = z.object({
  id: z.string().optional(),
  clientId: z.string().min(1),
  name: z.string().trim().min(2, "Ingresá el nombre."),
  role: opt(100),
  email: z.string().trim().toLowerCase().email("Ingresá un email válido.").optional().nullable().or(z.literal("")),
  phone: opt(60),
  whatsapp: opt(60),
  notes: opt(1000),
  isPrimary: z.boolean(),
});

export async function upsertClientContact(f: FormData): Promise<ActionResult> {
  const access = await staffForClient(val(f, "clientId"), ["clients.contacts", "clients.edit"]);
  if ("error" in access) return { ok: false, error: access.error };
  const p = contactForm.safeParse({
    id: val(f, "id") ?? undefined,
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
    const clean = { ...data, email: data.email || null };
    const row = await prisma.$transaction(async (tx) => {
      if (isPrimary) await tx.clientContact.updateMany({ where: { clientId: data.clientId }, data: { isPrimary: false } });
      if (id) {
        const existing = await tx.clientContact.findUnique({ where: { id }, select: { clientId: true } });
        if (existing?.clientId !== data.clientId) throw new Error("El contacto no es de este cliente.");
        return tx.clientContact.update({ where: { id }, data: { ...clean, isPrimary } });
      }
      return tx.clientContact.create({ data: { ...clean, isPrimary } });
    });
    refresh(data.clientId);
    return { ok: true, id: row.id };
  } catch (e) {
    console.error("[clientes] contacto", e);
    return { ok: false, error: "No pudimos guardar el contacto." };
  }
}

export async function deleteClientContact(f: FormData): Promise<ActionResult> {
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  const access = await staffForClient(clientId, ["clients.contacts", "clients.edit"]);
  if ("error" in access) return { ok: false, error: access.error };
  if (!id) return { ok: false, error: "Falta el contacto." };
  await prisma.clientContact.deleteMany({ where: { id, clientId: clientId! } });
  refresh(clientId!);
  return { ok: true, id };
}

export async function setPrimaryContact(f: FormData): Promise<ActionResult> {
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  const access = await staffForClient(clientId, ["clients.contacts", "clients.edit"]);
  if ("error" in access) return { ok: false, error: access.error };
  if (!id) return { ok: false, error: "Falta el contacto." };
  await prisma.$transaction([
    prisma.clientContact.updateMany({ where: { clientId: clientId! }, data: { isPrimary: false } }),
    prisma.clientContact.updateMany({ where: { id, clientId: clientId! }, data: { isPrimary: true } }),
  ]);
  refresh(clientId!);
  return { ok: true, id };
}

/** Clientes viejos con contacto solo en la empresa: lo pasa a la lista de contactos. */
export async function ensurePrimaryContact(clientId: string): Promise<ActionResult> {
  await requireStaff(["clients.view", "clients.view_all"]);
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: { contactName: true, email: true, phone: true, _count: { select: { contacts: true } } },
  });
  if (!c) return { ok: false, error: "El cliente no existe." };
  if (c._count.contacts || (!c.contactName && !c.email && !c.phone)) return { ok: true, id: clientId };
  await prisma.clientContact.create({
    data: { clientId, name: c.contactName || c.email || "Contacto principal", email: c.email, phone: c.phone, isPrimary: true },
  });
  return { ok: true, id: clientId };
}

// ─── Actividad (CRM) ────────────────────────────────────────────────────────

const activity = z.object({
  clientId: z.string().min(1),
  kind: z.enum(["NOTE", "CALL", "MEETING", "EMAIL", "WHATSAPP", "TASK"]),
  title: z.string().trim().min(2, "Ingresá un título."),
  body: opt(5000),
  dueAt: opt(50),
});

export async function createClientActivity(f: FormData): Promise<ActionResult> {
  const access = await staffForClient(val(f, "clientId"), ["clients.view", "clients.view_all"]);
  if ("error" in access) return { ok: false, error: access.error };
  const p = activity.safeParse({ clientId: f.get("clientId"), kind: f.get("kind"), title: f.get("title"), body: val(f, "body"), dueAt: val(f, "dueAt") });
  if (!p.success) return { ok: false, error: p.error.issues[0]?.message };
  try {
    const row = await logClientActivity({ ...p.data, dueAt: p.data.dueAt ? new Date(p.data.dueAt) : null, createdById: access.ctx.user.id });
    refresh(p.data.clientId);
    return { ok: true, id: row?.id };
  } catch (e) {
    console.error("[clientes] actividad", e);
    return { ok: false, error: "No pudimos guardar la actividad." };
  }
}

export async function completeClientActivity(f: FormData): Promise<ActionResult> {
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  const access = await staffForClient(clientId, ["clients.view", "clients.view_all"]);
  if ("error" in access) return { ok: false, error: access.error };
  const row = id ? await prisma.clientActivity.findUnique({ where: { id }, select: { doneAt: true, clientId: true } }) : null;
  if (!row || row.clientId !== clientId) return { ok: false, error: "La actividad no existe." };
  await prisma.clientActivity.update({ where: { id: id! }, data: { doneAt: row.doneAt ? null : new Date() } });
  refresh(clientId!);
  return { ok: true, id: id! };
}

export async function deleteClientActivity(f: FormData): Promise<ActionResult> {
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  const access = await staffForClient(clientId, ["clients.edit"]);
  if ("error" in access) return { ok: false, error: access.error };
  if (!id) return { ok: false, error: "Falta la actividad." };
  await prisma.clientActivity.deleteMany({ where: { id, clientId: clientId! } });
  refresh(clientId!);
  return { ok: true, id };
}

// ─── Accesos al portal ──────────────────────────────────────────────────────

/** Da acceso al portal a una persona de la empresa (invitación por mail o clave temporal). */
export async function createPortalUserForClient(f: FormData): Promise<ActionResult> {
  const clientId = val(f, "clientId");
  const access = await staffForClient(clientId, "clients.portal_users");
  if ("error" in access) return { ok: false, error: access.error };
  const name = val(f, "name"),
    email = val(f, "email")?.toLowerCase();
  if (!name || !email) return { ok: false, error: "Completá nombre y email." };
  if (!z.string().email().safeParse(email).success) return { ok: false, error: "Ingresá un email válido." };
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) return { ok: false, error: "Ya existe un usuario con ese email." };
  const client = await prisma.client.findUnique({ where: { id: clientId! }, select: { companyName: true, isActive: true } });
  if (!client) return { ok: false, error: "El cliente no existe." };
  if (!client.isActive) return { ok: false, error: "El cliente está desactivado: activalo primero." };
  const user = await prisma.user.create({
    data: { clientId, name, email, phone: val(f, "phone"), role: "CLIENT", companyName: client.companyName, passwordHash: await unusablePasswordHash(), createdById: access.ctx.user.id },
    select: { id: true, name: true, email: true },
  });
  const issued = await issueAccess(user, parseAccessMode(f.get("accessMode")), "portal");
  refresh(clientId!);
  revalidatePath("/admin/users");
  return { ok: true, id: user.id, access: issued };
}

async function portalUserOfClient(id: string | null, clientId: string | null) {
  if (!id || !clientId) return null;
  return prisma.user.findFirst({ where: { id, clientId, role: "CLIENT" }, select: { id: true, name: true, email: true, isActive: true } });
}

export async function resetPortalUserPassword(f: FormData): Promise<ActionResult> {
  const clientId = val(f, "clientId");
  const access = await staffForClient(clientId, "clients.portal_users");
  if ("error" in access) return { ok: false, error: access.error };
  const user = await portalUserOfClient(val(f, "id"), clientId);
  if (!user) return { ok: false, error: "El usuario de portal no existe." };
  const issued = await issueAccess(user, parseAccessMode(f.get("accessMode")), "portal");
  refresh(clientId!);
  return { ok: true, id: user.id, access: issued };
}

export async function togglePortalUserActive(f: FormData): Promise<ActionResult> {
  const clientId = val(f, "clientId");
  const access = await staffForClient(clientId, "clients.portal_users");
  if ("error" in access) return { ok: false, error: access.error };
  const user = await portalUserOfClient(val(f, "id"), clientId);
  if (!user) return { ok: false, error: "El usuario de portal no existe." };
  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { isActive: !user.isActive, sessionVersion: { increment: 1 } } }),
    ...(user.isActive ? [prisma.accountActivationToken.deleteMany({ where: { userId: user.id, usedAt: null } })] : []),
  ]);
  refresh(clientId!);
  return { ok: true, id: user.id };
}

// ─── Cuenta corriente ───────────────────────────────────────────────────────

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
  const access = await staffForClient(val(f, "clientId"), "clients.account");
  if ("error" in access) return { ok: false, error: access.error };
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
  const row = await prisma.accountMovement.create({ data: { ...p.data, dueDate: p.data.dueDate ? new Date(p.data.dueDate) : null } });
  await logClientActivity({ clientId: p.data.clientId, title: `Movimiento de cuenta: ${p.data.concept}`, referenceType: "MOVEMENT", referenceId: row.id, createdById: access.ctx.user.id });
  refresh(p.data.clientId);
  return { ok: true, id: row.id };
}

export async function toggleClientMovementPaid(f: FormData): Promise<ActionResult> {
  const id = val(f, "id"),
    clientId = val(f, "clientId");
  const access = await staffForClient(clientId, "clients.account");
  if ("error" in access) return { ok: false, error: access.error };
  const row = id ? await prisma.accountMovement.findUnique({ where: { id }, select: { paidAt: true, clientId: true } }) : null;
  if (!row || row.clientId !== clientId) return { ok: false, error: "El movimiento no existe." };
  await prisma.accountMovement.update({ where: { id: id! }, data: { paidAt: row.paidAt ? null : new Date() } });
  refresh(clientId!);
  return { ok: true, id: id! };
}

export type { AccessMode };
