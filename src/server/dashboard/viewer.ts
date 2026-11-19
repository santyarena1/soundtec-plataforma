import type { Prisma } from "@prisma/client";
import type { CurrentUser } from "@/lib/auth-helpers";
import { canSeeCosts, canSeeSalePrices, permissionsHave, type Permissions, type PermissionScope } from "@/lib/permissions";

/**
 * Quién mira el inicio del panel y qué alcance tiene cada bloque. Los bloques
 * no deciden permisos por su cuenta: todo sale de acá.
 */
export type DashboardViewer = {
  userId: string;
  firstName: string;
  isAdmin: boolean;
  can: (scope: PermissionScope) => boolean;
  /** Costos y márgenes (cambios de precio de proveedores). */
  seesCosts: boolean;
  /** Montos de cotizaciones (precio de venta). */
  seesSalePrices: boolean;
  /** Ve las cotizaciones de todos (y el detalle por vendedor). */
  quotesAll: boolean;
  /** Ve todos los clientes; si no, solo de los que es responsable. */
  clientsAll: boolean;
  /** Puede ver algo de clientes. */
  seesClients: boolean;
};

export function buildViewer(user: CurrentUser, permissions: Permissions, isAdmin: boolean): DashboardViewer {
  const can = (scope: PermissionScope) => permissionsHave(permissions, scope);
  const clientsAll = isAdmin || can("clients.view_all");
  return {
    userId: user.id,
    firstName: (user.name || "").split(" ")[0] || "equipo",
    isAdmin,
    can,
    seesCosts: canSeeCosts(permissions),
    seesSalePrices: canSeeSalePrices(permissions),
    quotesAll: isAdmin || can("quotes.view_all"),
    clientsAll,
    seesClients: clientsAll || can("clients.view"),
  };
}

/** Filtro de clientes según el alcance (todos, o los suyos). */
export function clientScope(viewer: DashboardViewer): Prisma.ClientWhereInput {
  return viewer.clientsAll ? {} : { ownerId: viewer.userId };
}

/** Filtro de cotizaciones según el alcance. */
export function quoteScope(viewer: DashboardViewer): Prisma.QuoteWhereInput {
  return viewer.quotesAll ? {} : { ownerId: viewer.userId };
}

/** Puede ver al menos una cotización. */
export function seesQuotes(viewer: DashboardViewer): boolean {
  return viewer.quotesAll || viewer.can("quotes.view_own");
}
