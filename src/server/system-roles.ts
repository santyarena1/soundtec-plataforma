/**
 * Roles que el sistema necesita (ej. "Vendedor"). Idempotente: solo crea lo
 * que falta; si el rol ya existe (aunque lo hayan editado o renombrado) no lo
 * toca. Lo corre el build y también la pantalla de usuarios/roles.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { SYSTEM_ROLES, parsePermissions, type PermissionScope } from "@/lib/permissions";
import { getSetting, setSetting } from "@/lib/settings";

/**
 * Permisos que se suman una sola vez a un rol del sistema que ya existía (por
 * si se creó antes de que existieran). Solo agregan: nunca sacan lo que el
 * admin haya configurado. Cada entrada se aplica una vez (queda registrada).
 */
const ROLE_UPGRADES: Array<{ id: string; key: string; add: PermissionScope[] }> = [
  { id: "2026-10-17-vendedor-leads-clientes-accesos", key: "vendedor", add: ["leads.view", "clients.view", "clients.create", "clients.edit", "clients.contacts", "clients.portal_users", "account_requests.create"] },
];
const UPGRADES_KEY = "roles.upgrades_applied";

async function applyRoleUpgrades(): Promise<void> {
  let applied: string[] = [];
  try {
    applied = JSON.parse(await getSetting(UPGRADES_KEY, "[]")) as string[];
  } catch {
    applied = [];
  }
  const pending = ROLE_UPGRADES.filter((u) => !applied.includes(u.id));
  if (!pending.length) return;
  for (const upgrade of pending) {
    const role = await prisma.customRole.findUnique({ where: { key: upgrade.key }, select: { id: true, permissionsJson: true } });
    if (role) {
      const raw = (role.permissionsJson && typeof role.permissionsJson === "object" ? role.permissionsJson : {}) as Record<string, unknown>;
      const perms = parsePermissions(raw);
      const scopes = [...new Set([...perms.scopes, ...upgrade.add])];
      await prisma.customRole.update({
        where: { id: role.id },
        // Un rol viejo sin «priceAccess» explícito no veía precios: un vendedor ve los de venta.
        data: { permissionsJson: { ...raw, scopes, priceAccess: typeof raw.priceAccess === "string" ? raw.priceAccess : "sale" } as unknown as Prisma.InputJsonValue },
      });
    }
    applied.push(upgrade.id);
  }
  await setSetting(UPGRADES_KEY, JSON.stringify(applied), { description: "Actualizaciones de permisos de roles del sistema ya aplicadas." });
}

export async function ensureSystemRoles(): Promise<string[]> {
  const created: string[] = [];
  for (const role of SYSTEM_ROLES) {
    const byKey = await prisma.customRole.findUnique({ where: { key: role.key }, select: { id: true } });
    if (byKey) continue;
    const byName = await prisma.customRole.findFirst({ where: { name: { equals: role.name, mode: "insensitive" } }, select: { id: true } });
    if (byName) {
      await prisma.customRole.update({ where: { id: byName.id }, data: { key: role.key } });
      continue;
    }
    await prisma.customRole.create({
      data: {
        key: role.key,
        name: role.name,
        description: role.description,
        baseSystemRole: "STAFF",
        permissionsJson: role.permissions as unknown as Prisma.InputJsonValue,
      },
    });
    created.push(role.name);
  }
  await applyRoleUpgrades();
  return created;
}
