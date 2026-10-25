import { Suspense } from "react";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ButtonLink } from "@/components/ui/button";
import { getSetting } from "@/lib/settings";
import { AdminSidebarNav } from "@/components/layout/admin-sidebar-nav";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { DolarTicker } from "@/components/layout/dolar-ticker";
import { ChangelogSidebarButton } from "@/components/layout/changelog-sidebar-button";
import { ChangelogPopup } from "@/components/layout/changelog-popup";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { canSeeCosts, canSeeSalePrices, isPanelRole, permissionsHave } from "@/lib/permissions";
import { CatalogModeButton } from "@/components/catalog-mode/catalog-mode-controls";
import { listAllChangelogs } from "@/server/changelog-query";
import { HelpDock } from "@/components/help/help-system";
import { OnboardingHost } from "@/components/onboarding/onboarding-host";
import { getOnboardingState } from "@/server/actions/onboarding";
import { loadReviewStatus } from "@/server/soundtube/review";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  // Valida la sesión contra la base (desactivado, clave reseteada, tipo cambiado).
  const { user, permissions } = await getCurrentPermissions();
  if (!isPanelRole(user.role)) redirect("/portal");
  const showCatalogMode = permissionsHave(permissions, "catalog_mode.use");

  const userName = session.user.name;
  const userEmail = session.user.email;
  const [appName, changelogs, onboardingState, pendingRequests, soundtubeReview] = await Promise.all([
    getSetting("app.name", "Soundtec"),
    listAllChangelogs().catch((err) => {
      console.error("changelog unread", err);
      return [];
    }),
    getOnboardingState(),
    permissionsHave(permissions, "account_requests.review")
      ? prisma.accountRequest.count({ where: { status: "PENDING" } }).catch(() => 0)
      : Promise.resolve(0),
    loadReviewStatus(),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  function BrandMark() {
    return (
      <Link href="/admin" className="flex min-w-0 items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/logo_soundtec.png" alt={appName} className="h-10 w-auto shrink-0 lg:h-11" />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Admin</p>
      </Link>
    );
  }

  function SidebarBody({ expandAll }: { expandAll?: boolean } = {}) {
    return (
      <>
        <div className="border-b border-border p-4">
          <BrandMark />
          {showCatalogMode ? (
            <div className="mt-3">
              <CatalogModeButton />
            </div>
          ) : null}
        </div>
        <AdminSidebarNav
          allowedScopes={permissions.scopes}
          fullAccess={permissions.fullAccess}
          seesCosts={canSeeCosts(permissions)}
          seesSalePrices={canSeeSalePrices(permissions)}
          expandAll={expandAll}
          counts={{ accountRequests: pendingRequests, soundtubeReview: soundtubeReview.pending }}
          active={{ soundtubeReview: soundtubeReview.active }}
        />
        <div className="border-t border-border p-3">
          <ChangelogSidebarButton entries={changelogs} />
          <DolarTicker />
        </div>
        <div className="border-t border-border p-3 text-xs">
          <p className="font-semibold">{userName}</p>
          <p className="truncate text-muted-foreground">{userEmail}</p>
          <div className="mt-3 space-y-1">
            <ButtonLink href="/portal/products" size="sm" variant="outline" className="w-full" data-tour="mode-client" title="Abre el catálogo con los precios de venta, tal como lo ve un cliente">
              Ver como cliente
            </ButtonLink>
            <div className="flex gap-1">
              <ButtonLink href="/cuenta/clave" size="sm" variant="ghost" className="flex-1">
                Cambiar contraseña
              </ButtonLink>
              <ButtonLink href="/cuenta/seguridad" size="sm" variant="ghost" title="Verificación en dos pasos">
                Seguridad
              </ButtonLink>
              <form action={handleSignOut}>
                <button type="submit" className="h-8 rounded-md border border-border px-3 text-xs hover:bg-secondary">
                  Salir
                </button>
              </form>
            </div>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-dvh bg-secondary/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-64 flex-col border-r border-border bg-card print:hidden xl:flex">
        <SidebarBody />
      </aside>

      <div className="flex min-h-dvh flex-col xl:pl-64 print:pl-0">
        <header className="sticky top-0 z-40 border-b border-border bg-card px-3 py-2 print:hidden xl:hidden">
          <div className="flex items-center gap-2">
            <AdminMobileNav>
              <SidebarBody expandAll />
            </AdminMobileNav>
            <div className="min-w-0 flex-1">
              <BrandMark />
            </div>
            {showCatalogMode ? <CatalogModeButton compact /> : null}
            <form action={handleSignOut}>
              <button type="submit" className="shrink-0 text-sm text-muted-foreground hover:text-foreground">
                Salir
              </button>
            </form>
          </div>
        </header>
        <main className="min-w-0 flex-1 overflow-x-auto p-3 pb-24 sm:p-6 lg:p-10 xl:pb-10 print:bg-white print:p-0">
          {children}
        </main>
        <Suspense fallback={null}>
          <HelpDock />
        </Suspense>
        <OnboardingHost
          surface="admin"
          initialState={onboardingState}
          access={{
            isAdmin: user.role === "ADMIN" || user.role === "SUPER_ADMIN",
            scopes: permissions.scopes,
            seesCosts: canSeeCosts(permissions),
            seesSalePrices: canSeeSalePrices(permissions),
          }}
        />
        <ChangelogPopup entries={changelogs} onboardingState={onboardingState} />
      </div>
    </div>
  );
}
