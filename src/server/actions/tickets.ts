"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentPermissions, requireAdmin } from "@/lib/auth-helpers";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(5).max(8000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

const quickSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(5).max(4000),
  pathname: z.string().max(400).optional().nullable(),
  url: z.string().max(800).optional().nullable(),
  tourId: z.string().max(80).optional().nullable(),
  tourStep: z.string().max(120).optional().nullable(),
  tourTarget: z.string().max(80).optional().nullable(),
  userAgent: z.string().max(400).optional().nullable(),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("HIGH"),
});

async function requireAnyAdminStaff() {
  const { user, permissions } = await getCurrentPermissions();
  const isBaseAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const hasAnyAdminScope =
    permissions.fullAccess || permissions.scopes.some((scope) => !scope.startsWith("portal."));
  if (!isBaseAdmin && !hasAnyAdminScope) {
    redirect("/portal");
  }
  return user;
}

export async function createTicket(formData: FormData): Promise<void> {
  const admin = await requireAdmin();
  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    priority: formData.get("priority") || "MEDIUM",
  });
  if (!parsed.success) return;

  await prisma.developerTicket.create({
    data: {
      createdById: admin.id,
      title: parsed.data.title,
      description: parsed.data.description,
      priority: parsed.data.priority,
    },
  });
  revalidatePath("/admin/tickets");
}

export async function createTicketQuick(input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await requireAnyAdminStaff();
  const parsed = quickSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Completá un título y qué pasó (mínimo unas palabras)." };
  }

  const contextLines = [
    "Reporte desde Ayuda (recorrido o error en pantalla).",
    parsed.data.pathname ? `Pantalla: ${parsed.data.pathname}` : null,
    parsed.data.url ? `URL: ${parsed.data.url}` : null,
    parsed.data.tourId
      ? `Recorrido: ${parsed.data.tourId}${parsed.data.tourStep ? ` · ${parsed.data.tourStep}` : ""}${
          parsed.data.tourTarget ? ` · campo ${parsed.data.tourTarget}` : ""
        }`
      : null,
    parsed.data.userAgent ? `Navegador: ${parsed.data.userAgent}` : null,
  ].filter(Boolean);

  await prisma.developerTicket.create({
    data: {
      createdById: user.id,
      title: parsed.data.title.startsWith("[Ayuda]") ? parsed.data.title : `[Ayuda] ${parsed.data.title}`,
      description: `${contextLines.join("\n")}\n\n${parsed.data.description}`,
      priority: parsed.data.priority,
    },
  });
  revalidatePath("/admin/tickets");
  return { ok: true };
}

const updateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"]),
  resolution: z.string().max(8000).optional().nullable(),
});

export async function updateTicket(formData: FormData): Promise<void> {
  await requireAdmin();
  const parsed = updateSchema.safeParse({
    id: formData.get("id"),
    status: formData.get("status"),
    resolution: formData.get("resolution") || null,
  });
  if (!parsed.success) return;
  await prisma.developerTicket.update({
    where: { id: parsed.data.id },
    data: { status: parsed.data.status, resolution: parsed.data.resolution },
  });
  revalidatePath("/admin/tickets");
}
