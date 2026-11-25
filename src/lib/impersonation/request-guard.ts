/**
 * Qué pedidos se frenan mientras hay una vista «Ver como» activa. Se decide
 * en el middleware (para todo el sitio, API incluida) antes de llegar al
 * código de cada pantalla. Pura: sin Next ni base, para poder probarla.
 */
import { IMPERSONATION_EXIT_PATH, IMPERSONATION_RENEW_PATH } from "@/lib/impersonation/token";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** Rutas GET que igual escriben algo a nombre de quien navega: cerradas durante la vista. */
const BLOCKED_GET_PREFIXES = ["/api/auth/signout", "/api/mailing/baja", "/e/", "/qr/"];

export type GuardDecision = "allow" | "block" | "exit";

export function isMutatingRequest(method: string, headers: { get(name: string): string | null }): boolean {
  if (headers.get("next-action")) return true;
  return !READ_METHODS.has(method.toUpperCase());
}

/**
 * - "exit": la ruta de salida (siempre abierta, limpia la cookie).
 * - "block": cualquier cambio (Server Actions, POST/PUT/PATCH/DELETE, cerrar sesión…).
 * - "allow": lectura.
 */
export function decideDuringImpersonation(input: { method: string; pathname: string; headers: { get(name: string): string | null } }): GuardDecision {
  const { pathname } = input;
  if (pathname === IMPERSONATION_EXIT_PATH && !input.headers.get("next-action")) return "exit";
  if (pathname === IMPERSONATION_RENEW_PATH && input.method.toUpperCase() === "GET" && !input.headers.get("next-action")) return "allow";
  if (isMutatingRequest(input.method, input.headers)) return "block";
  if (BLOCKED_GET_PREFIXES.some((p) => pathname === p || pathname.startsWith(p.endsWith("/") ? p : `${p}/`))) return "block";
  return "allow";
}

/**
 * Viendo como un cliente, el catálogo público (sin precios) no muestra lo que ve
 * él: se lleva a la misma pantalla del portal, con la búsqueda y los filtros.
 * Devuelve null si la ruta no es del catálogo público.
 */
export function portalEquivalent(pathname: string): string | null {
  if (pathname === "/catalogo" || pathname === "/catalogo/") return "/portal/products";
  if (/^\/catalogo\/comparar\/?$/.test(pathname)) return "/portal/comparar";
  const product = pathname.match(/^\/catalogo\/([^/]+)\/?$/);
  return product ? `/portal/products/${product[1]}` : null;
}
