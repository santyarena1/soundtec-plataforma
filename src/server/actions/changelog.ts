"use server";

import { redirect } from "next/navigation";
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
