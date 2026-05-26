"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";

const createSchema = z.object({
  title: z.string().min(3).max(160),
  description: z.string().min(5).max(8000),
  priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
});

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
