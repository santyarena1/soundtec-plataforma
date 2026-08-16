import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Bookmark, Heart, LayoutDashboard, Package, Send } from "lucide-react";
import { getSetting } from "@/lib/settings";
import { DraftMiniCart } from "@/components/portal/draft-mini-cart";
import { PortalToaster } from "@/components/portal/portal-toaster";
import { PortalBottomNav } from "@/components/layout/portal-bottom-nav";
import { getActiveDraftSummary } from "@/lib/draft-request";

const navItems = [
  { href: "/portal", label: "Inicio", icon: LayoutDashboard },
  { href: "/portal/products", label: "Catálogo", icon: Package },
  { href: "/portal/wishlist", label: "Favoritos", icon: Heart },
  { href: "/portal/lists", label: "Mis listas", icon: Bookmark },
  { href: "/portal/requests", label: "Mis solicitudes", icon: Send },
];

export async function PortalShell({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user) redirect("/login?callbackUrl=/portal");
  const [logoUrl, appName, draftSummary] = await Promise.all([
    getSetting("branding.logo_url", ""),
    getSetting("app.name", "Soundtec"),
    getActiveDraftSummary(session.user.id),
  ]);

  async function handleSignOut() {
    "use server";
    await signOut({ redirectTo: "/login" });
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
        <div className="container-page flex h-14 items-center justify-between gap-2 sm:h-16">
          <Link href="/portal" className="flex min-w-0 items-center gap-2">
            {logoUrl ? (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-md sm:h-11 sm:w-11">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={logoUrl} alt="Logo" className="h-full w-full object-contain" />
              </span>
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground sm:h-11 sm:w-11">
                S
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <p className="truncate text-sm font-semibold text-foreground">{appName} · Portal</p>
              <p className="hidden truncate text-[11px] uppercase tracking-wider text-muted-foreground sm:block">
                {session.user.companyName || session.user.name}
              </p>
            </div>
          </Link>

          <nav className="hidden gap-1 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            {(session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN") && (
              <ButtonLink href="/admin" size="sm" variant="outline" className="hidden sm:inline-flex">
                Modo admin
              </ButtonLink>
            )}
            {(session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN") && (
              <ButtonLink href="/admin" size="sm" variant="outline" className="sm:hidden">
                Admin
              </ButtonLink>
            )}
            <form action={handleSignOut}>
              <button className="text-sm text-muted-foreground hover:text-foreground" type="submit">
                Salir
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="container-page min-w-0 flex-1 py-5 pb-28 sm:py-8 md:pb-8">{children}</main>

      <footer className="mb-16 border-t border-border bg-card md:mb-0">
        <div className="container-page flex flex-col gap-1 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>© {new Date().getFullYear()} Soundtec S.R.L.</span>
          <span className="truncate">{session.user.email}</span>
        </div>
      </footer>

      <DraftMiniCart draft={draftSummary} />
      <PortalBottomNav />
      <PortalToaster />
    </div>
  );
}
