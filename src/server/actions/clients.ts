"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

const clientSchema = z.object({
  id: z.string().optional(),
  companyName: z.string().min(2).max(200),
  tradeName: z.string().max(200).optional().nullable(),
  contactName: z.string().max(120).optional().nullable(),
  email: z.string().email().optional().nullable().or(z.literal("")),
  phone: z.string().max(40).optional().nullable(),
  taxId: z.string().max(30).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  assignedPriceListId: z.string().optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertClient(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = clientSchema.safeParse({
    id: formData.get("id") || undefined,
    companyName: formData.get("companyName"),
    tradeName: formData.get("tradeName") || null,
    contactName: formData.get("contactName") || null,
    email: formData.get("email") || null,
    phone: formData.get("phone") || null,
    taxId: formData.get("taxId") || null,
    address: formData.get("address") || null,
    notes: formData.get("notes") || null,
    assignedPriceListId: formData.get("assignedPriceListId") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    companyName: parsed.data.companyName,
    tradeName: parsed.data.tradeName || null,
    contactName: parsed.data.contactName || null,
    email: parsed.data.email?.trim() || null,
    phone: parsed.data.phone || null,
    taxId: parsed.data.taxId || null,
    address: parsed.data.address || null,
    notes: parsed.data.notes || null,
    assignedPriceListId: parsed.data.assignedPriceListId || null,
    isActive: parsed.data.isActive ?? true,
  };

  if (parsed.data.id) {
    await prisma.client.update({ where: { id: parsed.data.id }, data });
    revalidatePath(`/admin/clients/${parsed.data.id}`);
  } else {
    await prisma.client.create({ data });
  }
  revalidatePath("/admin/clients");
}

const portalUserSchema = z.object({
  clientId: z.string().min(1),
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(120),
});

export async function createPortalUser(
  formData: FormData
): Promise<{ ok: boolean; error?: string }> {
  await requireAdmin();
  const parsed = portalUserSchema.safeParse({
    clientId: formData.get("clientId"),
    name: formData.get("name"),
    email: String(formData.get("email") || "").toLowerCase().trim(),
    password: formData.get("password"),
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const exists = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (exists) return { ok: false, error: "Ya existe un usuario con ese email." };

  const hash = await bcrypt.hash(parsed.data.password, 12);
  await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email,
      passwordHash: hash,
      role: "CLIENT",
      clientId: parsed.data.clientId,
      isActive: true,
    },
  });
  revalidatePath(`/admin/clients/${parsed.data.clientId}`);
  return { ok: true };
}

export async function toggleClientActive(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  const row = await prisma.client.findUnique({ where: { id } });
  if (!row) return;
  await prisma.client.update({ where: { id }, data: { isActive: !row.isActive } });
  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${id}`);
}
