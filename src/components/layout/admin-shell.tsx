import { Suspense } from "react";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { getSetting } from "@/lib/settings";
import { AdminSidebarNav } from "@/components/layout/admin-sidebar-nav";
import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { DolarTicker } from "@/components/layout/dolar-ticker";
import { ChangelogSidebarButton } from "@/components/layout/changelog-sidebar-button";
import { ChangelogPopup } from "@/components/layout/changelog-popup";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { listAllChangelogs } from "@/server/changelog-query";
import { HelpDock } from "@/components/help/help-system";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  const { permissions } = await getCurrentPermissions();
  const isBaseAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
  const hasAnyAdminScope =
    permissions.fullAccess || permissions.scopes.some((s) => !s.startsWith("portal."));
  if (!isBaseAdmin && !hasAnyAdminScope) {
    redirect("/portal");
  }

  const userName = session.user.name;
  const userEmail = session.user.email;
  const [logoUrl, appName, changelogs] = await Promise.all([
    getSetting("branding.logo_url", ""),
    getSetting("app.name", "Soundtec"),
    listAllChangelogs().catch((err) => {
      console.error("changelog unread", err);
      return [];
    }),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  function BrandMark() {
    return (
      <Link href="/admin" className="flex min-w-0 items-center gap-2">
        {logoUrl ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md lg:h-11 lg:w-11">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
          </span>
        ) : (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground lg:h-11 lg:w-11">
            S
          </span>
        )}
        <div className="min-w-0 leading-tight">
          <p className="truncate text-sm font-semibold">{appName}</p>
          <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Admin</p>
        </div>
      </Link>
    );
  }

  function SidebarBody({ expandAll }: { expandAll?: boolean } = {}) {
    return (
      <>
        <div className="border-b border-border p-4">
          <BrandMark />
        </div>
        <AdminSidebarNav
          allowedScopes={permissions.scopes}
          fullAccess={permissions.fullAccess}
          expandAll={expandAll}
        />
        <div className="border-t border-border p-3">
          <ChangelogSidebarButton entries={changelogs} />
          <DolarTicker />
        </div>
        <div className="border-t border-border p-3 text-xs">
          <p className="font-semibold">{userName}</p>
          <p className="truncate text-muted-foreground">{userEmail}</p>
          <div className="mt-3 flex gap-1">
            <ButtonLink href="/portal" size="sm" variant="outline" className="flex-1">
              Modo cliente
            </ButtonLink>
            <form action={handleSignOut}>
              <button type="submit" className="h-8 rounded-md border border-border px-2 text-xs hover:bg-secondary">
                Salir
              </button>
            </form>
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
        <ChangelogPopup entries={changelogs} />
      </div>
    </div>
  );
}
