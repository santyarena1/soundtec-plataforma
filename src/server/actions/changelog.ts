"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getCurrentPermissions, requireAdmin } from "@/lib/auth-helpers";
import {
  CHANGELOG_KINDS,
  type ChangelogItem,
} from "@/lib/changelog";
import { listAllChangelogs } from "@/server/changelog-query";

const itemSchema = z.object({
  kind: z.enum(CHANGELOG_KINDS),
  text: z.string().trim().min(3).max(400),
});

const saveSchema = z.object({
  id: z.string().optional(),
  version: z.string().trim().min(1).max(32),
  releasedAt: z.string().min(8),
  summary: z.string().trim().min(8).max(800),
  isPublished: z.boolean(),
  items: z.array(itemSchema).min(1).max(40),
});

async function requireAdminPanelUser() {
  const { user, permissions } = await getCurrentPermissions();
  const isBaseAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const hasAnyAdminScope =
    permissions.fullAccess || permissions.scopes.some((scope) => !scope.startsWith("portal."));
  if (!isBaseAdmin && !hasAnyAdminScope) {
    redirect("/portal");
  }
  return user;
}

function revalidateChangelog() {
  revalidatePath("/admin", "layout");
  revalidatePath("/admin/changelog");
}

function itemsFromForm(formData: FormData): ChangelogItem[] {
  const kinds = formData.getAll("itemKind").map((value) => String(value));
  const texts = formData.getAll("itemText").map((value) => String(value));
  return kinds
    .map((kind, index) => ({ kind, text: (texts[index] || "").trim() }))
    .filter((row): row is ChangelogItem => CHANGELOG_KINDS.includes(row.kind as ChangelogItem["kind"]) && row.text.length >= 3)
    .slice(0, 40);
}

export async function listChangelogEntries() {
  await requireAdminPanelUser();
  return listAllChangelogs();
}

export async function upsertChangelog(formData: FormData): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const parsed = saveSchema.safeParse({
    id: formData.get("id")?.toString() || undefined,
    version: formData.get("version"),
    releasedAt: formData.get("releasedAt"),
    summary: formData.get("summary"),
    isPublished: formData.get("isPublished") === "on",
    items: itemsFromForm(formData),
  });
  if (!parsed.success) {
    return { ok: false, error: "Completá versión, resumen y al menos un cambio." };
  }
  const releasedAt = new Date(`${parsed.data.releasedAt}T12:00:00`);
  if (!Number.isFinite(releasedAt.getTime())) {
    return { ok: false, error: "La fecha no es válida." };
  }
  const data = {
    version: parsed.data.version.replace(/^v/i, ""),
    releasedAt,
    summary: parsed.data.summary,
    items: parsed.data.items,
    isPublished: parsed.data.isPublished,
    createdById: admin.id,
  };
  if (parsed.data.id) {
    await prisma.adminChangelog.update({ where: { id: parsed.data.id }, data });
  } else {
    await prisma.adminChangelog.create({ data });
  }
  revalidateChangelog();
  return { ok: true };
}

export async function deleteChangelog(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.adminChangelog.delete({ where: { id } });
  revalidateChangelog();
}

export async function markChangelogsSeen(ids: string[]): Promise<{ ok: boolean }> {
  const user = await requireAdminPanelUser();
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return { ok: true };
  await prisma.adminChangelogRead.createMany({
    data: unique.map((changelogId) => ({ userId: user.id, changelogId })),
    skipDuplicates: true,
  });
  revalidateChangelog();
  return { ok: true };
}
