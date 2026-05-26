/**
 * Sistema de permisos centralizado.
 *
 * Declarativo y visual: el admin marca con checkboxes qué pantallas
 * y acciones puede usar cada rol personalizado. Nada de JSON crudo.
 *
 * El `permissionsJson` del CustomRole guarda el objeto Permissions.
 */

export type PermissionScope =
  | "dashboard"
  | "products.view"
  | "products.edit"
  | "products.delete"
  | "products.prices.view"
  | "brands.manage"
  | "distributors.manage"
  | "categories.manage"
  | "families.manage"
  | "imports.manage"
  | "share_lists.manage"
  | "scrapers.manage"
  | "margins.manage"
  | "discounts.manage"
  | "visibility.manage"
  | "requests.view"
  | "requests.respond"
  | "users.view"
  | "users.manage"
  | "clients.view"
  | "clients.manage"
  | "roles.manage"
  | "landing.manage"
  | "ai.manage"
  | "settings.manage"
  | "branding.manage"
  | "api_keys.manage"
  | "tickets.manage"
  | "portal.catalog"
  | "portal.requests"
  | "portal.cart";

export interface Permissions {
  scopes: PermissionScope[];
  /** Si true, ignora `scopes` y otorga todo (super-admin). */
  fullAccess?: boolean;
  /** Oculta TODO precio en la UI (para empleados internos sin acceso a precios). */
  hidePrices?: boolean;
}

export const PERMISSION_GROUPS: Array<{
  title: string;
  items: Array<{ scope: PermissionScope; label: string; help?: string }>;
}> = [
  {
    title: "Pantallas generales",
    items: [
      { scope: "dashboard", label: "Dashboard administrativo" },
    ],
  },
  {
    title: "Catálogo de productos",
    items: [
      { scope: "products.view", label: "Ver productos" },
      { scope: "products.edit", label: "Editar productos" },
      { scope: "products.delete", label: "Eliminar productos" },
      {
        scope: "products.prices.view",
        label: "Ver precios y costos",
        help: "Si está desactivado, no ve ningún precio, costo, margen ni descuento.",
      },
      { scope: "brands.manage", label: "Marcas" },
      { scope: "distributors.manage", label: "Distribuidores" },
      { scope: "categories.manage", label: "Categorías" },
      { scope: "families.manage", label: "Familias" },
    ],
  },
  {
    title: "Listas e importación",
    items: [
      { scope: "imports.manage", label: "Importaciones Excel" },
      { scope: "share_lists.manage", label: "Listas compartibles (link público)" },
      { scope: "scrapers.manage", label: "Scrapers" },
    ],
  },
  {
    title: "Precios y visibilidad",
    items: [
      { scope: "margins.manage", label: "Márgenes" },
      { scope: "discounts.manage", label: "Descuentos" },
      { scope: "visibility.manage", label: "Visibilidad por cliente" },
    ],
  },
  {
    title: "Solicitudes",
    items: [
      { scope: "requests.view", label: "Ver solicitudes" },
      { scope: "requests.respond", label: "Responder solicitudes" },
    ],
  },
  {
    title: "Clientes comerciales",
    items: [
      { scope: "clients.view", label: "Ver clientes (empresas)" },
      { scope: "clients.manage", label: "Crear / editar clientes" },
    ],
  },
  {
    title: "Usuarios del sistema",
    items: [
      { scope: "users.view", label: "Ver usuarios de acceso" },
      { scope: "users.manage", label: "Crear / editar usuarios" },
      { scope: "roles.manage", label: "Gestionar roles personalizados" },
    ],
  },
  {
    title: "Contenido y configuración",
    items: [
      { scope: "landing.manage", label: "Landing pública" },
      { scope: "ai.manage", label: "IA y feedback" },
      { scope: "settings.manage", label: "Configuración general" },
      { scope: "branding.manage", label: "Branding y logo" },
      { scope: "api_keys.manage", label: "API Keys" },
      { scope: "tickets.manage", label: "Tickets internos" },
    ],
  },
  {
    title: "Portal del cliente (si el rol base es Cliente)",
    items: [
      { scope: "portal.catalog", label: "Ver catálogo público" },
      { scope: "portal.requests", label: "Crear solicitudes" },
      { scope: "portal.cart", label: "Usar carrito" },
    ],
  },
];

export const PERMISSION_LABEL: Record<PermissionScope, string> = (() => {
  const map = {} as Record<PermissionScope, string>;
  for (const g of PERMISSION_GROUPS) {
    for (const it of g.items) map[it.scope] = it.label;
  }
  return map;
})();

/** Preset: rol "Empleado catálogo" — sólo ve y edita productos, sin precios, sin nada más. */
export const PRESET_CATALOG_EMPLOYEE: Permissions = {
  scopes: ["products.view", "products.edit"],
  hidePrices: true,
};

/** Preset: rol "Comercial Senior" — todo lo comercial, sin sistema. */
export const PRESET_COMMERCIAL_SENIOR: Permissions = {
    scopes: [
    "dashboard",
    "products.view",
    "products.prices.view",
    "brands.manage",
    "categories.manage",
    "families.manage",
    "clients.view",
    "clients.manage",
    "requests.view",
    "requests.respond",
    "users.view",
    "margins.manage",
    "discounts.manage",
    "visibility.manage",
    "share_lists.manage",
  ],
};

export function parsePermissions(raw: unknown): Permissions {
  if (!raw || typeof raw !== "object") return { scopes: [] };
  const obj = raw as Record<string, unknown>;
  const scopes = Array.isArray(obj.scopes)
    ? (obj.scopes.filter((s) => typeof s === "string") as PermissionScope[])
    : [];
  return {
    scopes,
    fullAccess: obj.fullAccess === true,
    hidePrices: obj.hidePrices === true,
  };
}

export function permissionsHave(perms: Permissions | null | undefined, scope: PermissionScope): boolean {
  if (!perms) return false;
  if (perms.fullAccess) return true;
  return perms.scopes.includes(scope);
}

/**
 * Resuelve los permisos efectivos del usuario combinando rol base + rol custom.
 * - ADMIN / SUPER_ADMIN sin customRole = full access.
 * - CLIENT sin customRole = acceso al portal estándar.
 * - Con customRole, los permisos del rol custom mandan.
 */
export function resolveEffectivePermissions(input: {
  baseRole: "SUPER_ADMIN" | "ADMIN" | "CLIENT";
  customPermissions: Permissions | null;
}): Permissions {
  const { baseRole, customPermissions } = input;

  if (customPermissions) {
    if (baseRole === "SUPER_ADMIN") return { ...customPermissions, fullAccess: true };
    return customPermissions;
  }

  if (baseRole === "SUPER_ADMIN") return { scopes: [], fullAccess: true };
  if (baseRole === "ADMIN") {
    return {
      scopes: PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.scope)),
    };
  }
  return {
    scopes: ["portal.catalog", "portal.requests", "portal.cart"],
  };
}
