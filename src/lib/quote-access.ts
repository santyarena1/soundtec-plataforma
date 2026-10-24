import { redirect } from "next/navigation";
import { orderQuoteSections } from "@/lib/quote-section-order";
import { QUOTE_MODULES } from "@/lib/quote-defaults";
import { prisma } from "@/lib/prisma";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { isPanelRole, permissionsHave, type PermissionScope } from "@/lib/permissions";

export async function requireQuotePermission(scope: PermissionScope) {
  const { user, permissions } = await getCurrentPermissions();
  // Cotizaciones: solo panel (admins y equipo con el permiso), nunca usuarios del portal.
  const ok =
    isPanelRole(user.role) &&
    (permissions.fullAccess ||
      permissionsHave(permissions, scope) ||
      (scope === "quotes.view_own" && permissionsHave(permissions, "quotes.view_all")));
  if (!ok) {
    if (user.role === "CLIENT") redirect("/portal");
    redirect("/admin?sinPermiso=1");
  }
  return { user, permissions };
}

export async function canViewQuote(input: {
  ownerId: string;
  userId: string;
  permissions: { scopes: string[]; fullAccess?: boolean };
}) {
  if (input.permissions.fullAccess) return true;
  if (input.permissions.scopes.includes("quotes.view_all")) return true;
  return input.ownerId === input.userId;
}

export async function loadQuoteForUser(id: string) {
  const { user, permissions } = await getCurrentPermissions();
  const quote = await prisma.quote.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, companyName: true, tradeName: true } },
      owner: { select: { id: true, name: true, email: true, quoteSignName: true, quoteSignTitle: true } },
      contentProfile: true,
      alternatives: { orderBy: { sortOrder: "asc" } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: {
            select: {
              id: true,
              normalizedName: true,
              shortDescription: true,
              brand: { select: { name: true } },
            },
          },
        },
      },
      itemGroups: { orderBy: { sortOrder: "asc" } },
      classifierPicks: true,
      sections: { orderBy: { sortOrder: "asc" } },
      assets: { orderBy: { sortOrder: "asc" } },
      brandSelections: { orderBy: { sortOrder: "asc" } },
      context: true,
      terms: true,
    },
  });
  if (!quote) return { quote: null, user, permissions, forbidden: false as const };
  const ok = await canViewQuote({ ownerId: quote.ownerId, userId: user.id, permissions });
  if (!ok) return { quote: null, user, permissions, forbidden: true as const };
  // Mismo orden que el PDF: el de la plantilla (en cotizaciones viejas el guardado quedó mezclado).
  const sections = orderQuoteSections(quote.sections, QUOTE_MODULES.map((m) => m.key));
  return { quote: { ...quote, sections }, user, permissions, forbidden: false as const };
}

/**
 * Para MODIFICAR una cotización: exige el permiso «Editar cotizaciones», que
 * pueda verla y que no esté emitida. Devuelve la misma forma que
 * loadQuoteForUser; si algo falla, `quote` viene en null y `blockedReason`
 * dice por qué. Antes muchas acciones solo pedían permiso de ver.
 */
export async function loadQuoteForEdit(id: string) {
  await requireQuotePermission("quotes.edit");
  const loaded = await loadQuoteForUser(id);
  if (!loaded.quote) return { ...loaded, blockedReason: "Sin acceso a esta cotización." as string | null };
  if (loaded.quote.status === "ISSUED") {
    return { ...loaded, quote: null, blockedReason: "La cotización ya está emitida: duplicala para cambiarla." as string | null };
  }
  return { ...loaded, blockedReason: null as string | null };
}
