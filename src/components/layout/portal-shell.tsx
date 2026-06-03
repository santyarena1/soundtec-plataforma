import Link from "next/link";
import { auth, signOut } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ButtonLink } from "@/components/ui/button";
import { Bookmark, Heart, LayoutDashboard, Package, Send } from "lucide-react";
import { getSetting } from "@/lib/settings";
import { DraftMiniCart } from "@/components/portal/draft-mini-cart";
import { PortalToaster } from "@/components/portal/portal-toaster";
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
      <header className="border-b border-border bg-card">
        <div className="container-page flex h-16 items-center justify-between">
          <Link href="/portal" className="flex items-center gap-2">
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
              <p className="text-sm font-semibold text-foreground">{appName} · Portal</p>
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">
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

          <div className="flex items-center gap-2">
            {(session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN") && (
              <ButtonLink href="/admin" size="sm" variant="outline">
                Modo admin
              </ButtonLink>
            )}
            <form action={handleSignOut}>
              <button className="text-sm text-muted-foreground hover:text-foreground" type="submit">
                Salir
              </button>
            </form>
          </div>
        </div>

        <div className="container-page flex gap-1 overflow-x-auto py-2 md:hidden">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </div>
      </header>

      <main className="container-page flex-1 py-8">{children}</main>

      <footer className="border-t border-border bg-card">
        <div className="container-page flex items-center justify-between py-4 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Soundtec S.R.L.</span>
          <span>{session.user.email}</span>
        </div>
      </footer>

      <DraftMiniCart draft={draftSummary} />
      <PortalToaster />
    </div>
  );
}
