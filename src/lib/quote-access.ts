import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { permissionsHave, type PermissionScope } from "@/lib/permissions";

export async function requireQuotePermission(scope: PermissionScope) {
  const { user, permissions } = await getCurrentPermissions();
  const ok =
    permissions.fullAccess ||
    permissionsHave(permissions, scope) ||
    (scope === "quotes.view_own" && permissionsHave(permissions, "quotes.view_all"));
  if (!ok) {
    if (user.role === "CLIENT") redirect("/portal");
    redirect("/admin");
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
      context: true,
      terms: true,
    },
  });
  if (!quote) return { quote: null, user, permissions, forbidden: false as const };
  const ok = await canViewQuote({ ownerId: quote.ownerId, userId: user.id, permissions });
  if (!ok) return { quote: null, user, permissions, forbidden: true as const };
  return { quote, user, permissions, forbidden: false as const };
}
