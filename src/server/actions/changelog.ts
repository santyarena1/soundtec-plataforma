"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { listAllChangelogs } from "@/server/changelog-query";

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

export async function listChangelogEntries() {
  await requireAdminPanelUser();
  return listAllChangelogs();
}

export async function markChangelogsSeen(ids: string[]): Promise<{ ok: boolean }> {
  const user = await requireAdminPanelUser();
  const unique = [...new Set(ids.filter(Boolean))].slice(0, 50);
  if (unique.length === 0) return { ok: true };
  try {
    await prisma.adminChangelogRead.createMany({
      data: unique.map((changelogId) => ({ userId: user.id, changelogId })),
      skipDuplicates: true,
    });
  } catch (err) {
    console.error("markChangelogsSeen", err);
    return { ok: false };
  }
  try {
    revalidatePath("/admin", "layout");
    revalidatePath("/admin/changelog");
  } catch (err) {
    console.error("markChangelogsSeen revalidate", err);
  }
  return { ok: true };
}
