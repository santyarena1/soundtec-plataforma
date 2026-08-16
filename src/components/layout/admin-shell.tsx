import { Suspense } from "react";
import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { getSetting } from "@/lib/settings";
import { AdminSidebarNav } from "@/components/layout/admin-sidebar-nav";
import { DolarTicker } from "@/components/layout/dolar-ticker";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { HelpDock } from "@/components/help/help-system";

export async function AdminShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/admin");

  // Permite que un empleado con rol base CLIENT pero customRole admin (ej. EMPLEADO_CATALOGO)
  // pueda ingresar a admin sólo si sus permisos lo habilitan.
  const { permissions } = await getCurrentPermissions();
  const isBaseAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
  const hasAnyAdminScope =
    permissions.fullAccess ||
    permissions.scopes.some((s) => !s.startsWith("portal."));
  if (!isBaseAdmin && !hasAnyAdminScope) {
    redirect("/portal");
  }

  const [logoUrl, appName] = await Promise.all([
    getSetting("branding.logo_url", ""),
    getSetting("app.name", "Soundtec"),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="min-h-dvh bg-secondary/30">
      <aside className="fixed inset-y-0 left-0 z-30 hidden h-dvh w-64 border-r border-border bg-card print:hidden lg:flex lg:flex-col">
        <Link href="/admin" className="flex items-center gap-2 border-b border-border p-4">
          {logoUrl ? (
            <span className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-md">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
            </span>
          ) : (
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              S
            </span>
          )}
          <div className="leading-tight">
            <p className="text-sm font-semibold">{appName}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Admin</p>
          </div>
        </Link>
        <AdminSidebarNav allowedScopes={permissions.scopes} fullAccess={permissions.fullAccess} />
        <div className="border-t border-border p-3">
          <DolarTicker />
        </div>
        <div className="border-t border-border p-3 text-xs">
          <p className="font-semibold">{session.user.name}</p>
          <p className="truncate text-muted-foreground">{session.user.email}</p>
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
      </aside>

      <div className="flex min-h-dvh flex-col lg:pl-64 print:pl-0">
        <header className="flex flex-col gap-1.5 border-b border-border bg-card px-4 py-2 print:hidden lg:hidden">
          <div className="flex items-center justify-between">
            <Link href="/admin" className="flex items-center gap-2">
              {logoUrl ? (
                <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
                </span>
              ) : (
                <span className="flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
                  S
                </span>
              )}
              <span className="text-sm font-semibold">{appName} Admin</span>
            </Link>
            <form action={handleSignOut}>
              <button type="submit" className="text-sm text-muted-foreground hover:text-foreground">
                Salir
              </button>
            </form>
          </div>
          <DolarTicker compact />
        </header>
        <main className="flex-1 p-4 sm:p-6 lg:p-10 print:p-0 print:bg-white">{children}</main>
        <Suspense fallback={null}>
          <HelpDock />
        </Suspense>
      </div>
    </div>
  );
}
