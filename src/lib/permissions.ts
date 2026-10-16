/**
 * Sistema de permisos centralizado.
 *
 * Cada rol (CustomRole) guarda en `permissionsJson` un objeto Permissions:
 * - `scopes`: qué pantallas y acciones puede usar (checkboxes en Configuración → Roles).
 * - `priceAccess`: qué precios ve, independiente de las pantallas:
 *     "full" → costos, márgenes, proveedores e importación;
 *     "sale" → solo precios de venta (como los ve un cliente);
 *     "none" → ningún precio.
 *
 * Tipos de usuario (UserRole):
 * - SUPER_ADMIN / ADMIN: acceso total al panel (los roles no los limitan).
 * - STAFF: equipo interno; entra al panel SOLO a lo que su rol permite.
 * - CLIENT: usuario del portal de una empresa cliente.
 */

export type PermissionScope =
  | "dashboard"
  | "products.view"
  | "products.edit"
  | "products.delete"
  /** Legado: equivale a priceAccess "full". */
  | "products.prices.view"
  | "catalog_mode.use"
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
  | "room_builder.use"
  | "users.view"
  | "users.manage"
  | "clients.view"
  | "clients.view_all"
  | "clients.create"
  | "clients.edit"
  | "clients.delete"
  | "clients.contacts"
  | "clients.commercial"
  | "clients.portal_users"
  | "clients.account"
  /** Legado: equivale a crear + editar + contactos + accesos al portal + cuenta corriente. */
  | "clients.manage"
  | "account_requests.create"
  | "account_requests.review"
  | "leads.view"
  | "roles.manage"
  | "landing.manage"
  | "ai.manage"
  | "settings.manage"
  | "branding.manage"
  | "api_keys.manage"
  | "tickets.manage"
  | "portal.catalog"
  | "portal.requests"
  | "portal.cart"
  | "quotes.view_own"
  | "quotes.view_all"
  | "quotes.create"
  | "quotes.edit"
  | "quotes.issue"
  | "quotes.submit_review"
  | "quotes.approve"
  | "quotes.manage_library";

export type PriceAccess = "full" | "sale" | "none";

export interface Permissions {
  scopes: PermissionScope[];
  /** Si true, ignora `scopes` y otorga todo (super-admin). */
  fullAccess?: boolean;
  /** Qué precios ve. Ver encabezado. */
  priceAccess?: PriceAccess;
  /** Legado: equivale a priceAccess "none". */
  hidePrices?: boolean;
}

export const PRICE_ACCESS_OPTIONS: Array<{ value: PriceAccess; label: string; help: string }> = [
  {
    value: "sale",
    label: "Solo precios de venta",
    help: "Ve el precio final como lo ve un cliente. No ve costos, márgenes, proveedores, importación ni reglas de precio.",
  },
  {
    value: "full",
    label: "Todo: costos y márgenes",
    help: "Ve costos, márgenes, proveedores, posiciones arancelarias e importaciones.",
  },
  { value: "none", label: "Ningún precio", help: "No ve ningún precio, costo ni descuento (ej. carga de catálogo)." },
];

export const PERMISSION_GROUPS: Array<{
  title: string;
  /** Solo para usuarios del portal (rol de tipo Cliente). */
  portal?: boolean;
  items: Array<{ scope: PermissionScope; label: string; help?: string; costs?: boolean }>;
}> = [
  {
    title: "Panel",
    items: [
      { scope: "dashboard", label: "Inicio con resumen", help: "Indicadores de pedidos, cotizaciones y clientes. Los datos de costos solo aparecen con acceso a costos." },
    ],
  },
  {
    title: "Catálogo",
    items: [
      { scope: "catalog_mode.use", label: "Botón «Catálogo sin precios»", help: "Abre el portal sin ningún precio para mostrarle productos a un cliente." },
      { scope: "products.view", label: "Ver productos en el panel", help: "Listado y fichas del panel. Sin acceso a costos se ven solo los datos comerciales." },
      { scope: "products.edit", label: "Crear y editar productos", costs: true },
      { scope: "products.delete", label: "Eliminar productos", costs: true },
      { scope: "brands.manage", label: "Marcas" },
      { scope: "categories.manage", label: "Categorías" },
      { scope: "families.manage", label: "Familias" },
      { scope: "distributors.manage", label: "Proveedores", costs: true },
    ],
  },
  {
    title: "Cotizaciones",
    items: [
      { scope: "quotes.view_own", label: "Ver sus cotizaciones" },
      { scope: "quotes.view_all", label: "Ver las cotizaciones de todos" },
      { scope: "quotes.create", label: "Crear cotizaciones" },
      { scope: "quotes.edit", label: "Editar cotizaciones" },
      { scope: "quotes.submit_review", label: "Enviar a revisión", help: "Para quien no puede emitir: un admin revisa y emite." },
      { scope: "quotes.issue", label: "Emitir el PDF oficial sin revisión" },
      { scope: "quotes.approve", label: "Aprobar cotizaciones de otros" },
      { scope: "quotes.manage_library", label: "Biblioteca, numeración y perfiles" },
    ],
  },
  {
    title: "Pedidos de clientes",
    items: [
      { scope: "requests.view", label: "Ver pedidos" },
      { scope: "requests.respond", label: "Responder y gestionar pedidos" },
    ],
  },
  {
    title: "Room Builder",
    items: [{ scope: "room_builder.use", label: "Diseñar salas y proyectos", help: "Con acceso «solo venta» los equipos muestran precio de venta." }],
  },
  {
    title: "Clientes (empresas)",
    items: [
      { scope: "clients.view", label: "Ver sus clientes", help: "Los clientes de los que es responsable." },
      { scope: "clients.view_all", label: "Ver todos los clientes" },
      { scope: "clients.create", label: "Crear clientes" },
      { scope: "clients.edit", label: "Editar datos de la empresa" },
      { scope: "clients.contacts", label: "Agregar y editar contactos" },
      { scope: "clients.commercial", label: "Condiciones comerciales y descuentos", help: "Descuentos, forma de pago, límite de crédito y precios en el portal." },
      { scope: "clients.portal_users", label: "Dar y quitar acceso al portal" },
      { scope: "clients.account", label: "Cuenta corriente" },
      { scope: "clients.delete", label: "Eliminar clientes" },
    ],
  },
  {
    title: "Altas y leads",
    items: [
      { scope: "account_requests.create", label: "Pedir el alta de una empresa nueva", help: "La solicitud la aprueba un administrador." },
      { scope: "account_requests.review", label: "Aprobar o rechazar altas" },
      { scope: "leads.view", label: "Ver leads del catálogo y del asistente" },
    ],
  },
  {
    title: "Precios y reglas",
    items: [
      { scope: "margins.manage", label: "Márgenes", costs: true },
      { scope: "discounts.manage", label: "Descuentos generales", costs: true },
      { scope: "visibility.manage", label: "Visibilidad por cliente" },
      { scope: "share_lists.manage", label: "Listas compartibles (link público)" },
    ],
  },
  {
    title: "Usuarios y roles",
    items: [
      { scope: "users.view", label: "Ver usuarios" },
      { scope: "users.manage", label: "Crear y editar usuarios" },
      { scope: "roles.manage", label: "Crear y editar roles" },
    ],
  },
  {
    title: "Sitio",
    items: [
      { scope: "landing.manage", label: "Landing pública" },
      { scope: "tickets.manage", label: "Tickets al desarrollador" },
    ],
  },
  {
    title: "Portal del cliente",
    portal: true,
    items: [
      { scope: "portal.catalog", label: "Ver el catálogo" },
      { scope: "portal.requests", label: "Hacer pedidos" },
      { scope: "portal.cart", label: "Usar el carrito" },
    ],
  },
];

/**
 * Solo administradores (no se asignan a roles): importar listas y sincronizar
 * proveedores, scrapers, configuración del sistema, marca, integraciones e IA.
 */
export const ADMIN_ONLY_SCOPES: PermissionScope[] = ["imports.manage", "scrapers.manage", "settings.manage", "branding.manage", "api_keys.manage", "ai.manage"];

/** Todos los scopes que se pueden marcar en un rol (sin los legados ni los de administradores). */
export const ALL_SCOPES: PermissionScope[] = PERMISSION_GROUPS.flatMap((g) => g.items.map((i) => i.scope));

export const PERMISSION_LABEL: Record<PermissionScope, string> = (() => {
  const map = {} as Record<PermissionScope, string>;
  for (const g of PERMISSION_GROUPS) {
    for (const it of g.items) map[it.scope] = it.label;
  }
  map["products.prices.view"] = "Ver precios y costos (legado)";
  map["clients.manage"] = "Crear y editar clientes (legado)";
  return map;
})();

/** Rol "Vendedor": vende con precios de venta, sin costos ni márgenes. Editable en Configuración → Roles. */
export const PRESET_SELLER: Permissions = {
  scopes: [
    "dashboard",
    "catalog_mode.use",
    "quotes.view_own",
    "quotes.create",
    "quotes.edit",
    "quotes.submit_review",
    "requests.view",
    "requests.respond",
    "room_builder.use",
    "clients.view",
    "clients.create",
    "clients.edit",
    "clients.contacts",
    "clients.portal_users",
    "account_requests.create",
    "leads.view",
  ],
  priceAccess: "sale",
};

/** Rol "Catálogo": marcas, categorías y familias, y ver productos, sin precios (editar fichas requiere costos). */
export const PRESET_CATALOG_EMPLOYEE: Permissions = {
  scopes: ["products.view", "brands.manage", "categories.manage", "families.manage"],
  priceAccess: "none",
};

/** Rol "Comercial senior": todo lo comercial (con costos), sin sistema. */
export const PRESET_COMMERCIAL_SENIOR: Permissions = {
  scopes: [
    "dashboard",
    "catalog_mode.use",
    "products.view",
    "brands.manage",
    "categories.manage",
    "families.manage",
    "clients.view",
    "clients.view_all",
    "clients.create",
    "clients.edit",
    "clients.contacts",
    "clients.commercial",
    "clients.portal_users",
    "clients.account",
    "account_requests.create",
    "account_requests.review",
    "leads.view",
    "requests.view",
    "requests.respond",
    "room_builder.use",
    "users.view",
    "margins.manage",
    "discounts.manage",
    "visibility.manage",
    "share_lists.manage",
    "quotes.view_own",
    "quotes.view_all",
    "quotes.create",
    "quotes.edit",
    "quotes.issue",
    "quotes.approve",
  ],
  priceAccess: "full",
};

/** Roles que el sistema crea si no existen (después se editan como cualquier otro). */
export const SYSTEM_ROLES: Array<{ key: string; name: string; description: string; permissions: Permissions }> = [
  {
    key: "vendedor",
    name: "Vendedor",
    description: "Cotiza, atiende pedidos y gestiona sus clientes con precios de venta. No ve costos, márgenes, proveedores ni importaciones.",
    permissions: PRESET_SELLER,
  },
];

const LEGACY_CLIENTS_MANAGE: PermissionScope[] = ["clients.create", "clients.edit", "clients.contacts", "clients.portal_users", "clients.account"];
const PRICE_ACCESS_VALUES: readonly PriceAccess[] = ["full", "sale", "none"];

export function parsePermissions(raw: unknown): Permissions {
  if (!raw || typeof raw !== "object") return { scopes: [], priceAccess: "none" };
  const obj = raw as Record<string, unknown>;
  const scopes = Array.isArray(obj.scopes) ? (obj.scopes.filter((s) => typeof s === "string") as PermissionScope[]) : [];
  const explicit = PRICE_ACCESS_VALUES.includes(obj.priceAccess as PriceAccess) ? (obj.priceAccess as PriceAccess) : undefined;
  // Roles viejos: hidePrices → nada; "Ver precios y costos" → todo; si no, no veían precios.
  const priceAccess: PriceAccess =
    explicit ?? (obj.hidePrices === true ? "none" : scopes.includes("products.prices.view") ? "full" : "none");
  const expanded = (scopes.includes("clients.manage") ? [...new Set([...scopes, ...LEGACY_CLIENTS_MANAGE])] : scopes).filter(
    (s) => !(ADMIN_ONLY_SCOPES as string[]).includes(s)
  );
  return { scopes: expanded, fullAccess: obj.fullAccess === true, priceAccess };
}

export function permissionsHave(perms: Permissions | null | undefined, scope: PermissionScope): boolean {
  if (!perms) return false;
  if (perms.fullAccess) return true;
  return perms.scopes.includes(scope);
}

export function permissionsHaveAny(perms: Permissions | null | undefined, scopes: PermissionScope[]): boolean {
  return scopes.some((s) => permissionsHave(perms, s));
}

/** Ve costos, márgenes, proveedores e importación. */
export function canSeeCosts(perms: Permissions | null | undefined): boolean {
  if (!perms) return false;
  return perms.fullAccess === true || perms.priceAccess === "full";
}

/** Ve precios de venta (con o sin costos). */
export function canSeeSalePrices(perms: Permissions | null | undefined): boolean {
  if (!perms) return false;
  return perms.fullAccess === true || perms.priceAccess === "full" || perms.priceAccess === "sale";
}

export type BaseRole = "SUPER_ADMIN" | "ADMIN" | "STAFF" | "CLIENT";

/** Panel de administración: admins siempre; equipo interno, con lo que su rol permite. */
export function isPanelRole(role: string | null | undefined): role is "SUPER_ADMIN" | "ADMIN" | "STAFF" {
  return role === "SUPER_ADMIN" || role === "ADMIN" || role === "STAFF";
}

export function isAdminRole(role: string | null | undefined): role is "SUPER_ADMIN" | "ADMIN" {
  return role === "SUPER_ADMIN" || role === "ADMIN";
}

/**
 * Permisos efectivos del usuario según su tipo y su rol.
 * - SUPER_ADMIN: todo.
 * - ADMIN: todo el panel con costos (un rol asignado no lo limita: para limitar, usar tipo Equipo).
 * - STAFF: lo que diga su rol; sin rol, solo el inicio y sin precios.
 * - CLIENT: portal estándar, o lo que diga su rol.
 */
export function resolveEffectivePermissions(input: { baseRole: BaseRole; customPermissions: Permissions | null }): Permissions {
  const { baseRole, customPermissions } = input;
  if (baseRole === "SUPER_ADMIN") return { scopes: [...ALL_SCOPES, ...ADMIN_ONLY_SCOPES], fullAccess: true, priceAccess: "full" };
  if (baseRole === "ADMIN") return { scopes: [...ALL_SCOPES, ...ADMIN_ONLY_SCOPES], priceAccess: "full" };
  if (baseRole === "STAFF") return customPermissions ?? { scopes: ["dashboard"], priceAccess: "none" };
  return customPermissions ?? { scopes: ["portal.catalog", "portal.requests", "portal.cart"], priceAccess: "sale" };
}
