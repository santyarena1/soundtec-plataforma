"use server";

import { redirect } from "next/navigation";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { changelogEntriesByIds, listAllChangelogs } from "@/server/changelog-query";
import type { ChangelogEntryView } from "@/lib/changelog";

/** Tope de novedades que muestra el aviso (las más nuevas); el resto queda en la pantalla Changelog. */
const CHANGELOG_POPUP_MAX = 12;

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

/** Texto de las novedades sin ver (el aviso las pide recién cuando tiene que abrirse). */
export async function loadChangelogEntries(ids: unknown): Promise<ChangelogEntryView[]> {
  await requireAdminPanelUser();
  if (!Array.isArray(ids)) return [];
  const clean = ids.filter((id): id is string => typeof id === "string" && id.length > 0 && id.length < 200).slice(0, 1000);
  return changelogEntriesByIds(clean).slice(0, CHANGELOG_POPUP_MAX);
}
