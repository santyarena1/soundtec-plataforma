import Link from "next/link";
import { auth } from "@/lib/auth";
import { ButtonLink } from "@/components/ui/button";
import { getSetting } from "@/lib/settings";
import { PublicMobileMenu } from "@/components/layout/public-mobile-menu";

export async function PublicNavbar() {
  let session: { user?: { role?: string } } | null = null;
  try {
    const raw = await (auth as unknown as () => Promise<{ user?: { role?: string } } | null>)();
    session = raw;
  } catch {
    session = null;
  }
  const target = session?.user?.role === "ADMIN" || session?.user?.role === "SUPER_ADMIN" ? "/admin" : "/portal";
  let logoUrl = "";
  let appName = "Soundtec";
  try {
    const [logo, name] = await Promise.all([
      getSetting("branding.logo_url", ""),
      getSetting("app.name", "Soundtec"),
    ]);
    logoUrl = logo || "";
    appName = name || "Soundtec";
  } catch {
    logoUrl = "";
    appName = "Soundtec";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container-page relative flex h-16 items-center justify-between gap-2">
        <Link href="/" className="flex min-w-0 items-center gap-2">
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
            <p className="text-sm font-semibold text-foreground">{appName}</p>
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Audiovisual Pro</p>
          </div>
        </Link>

        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/#soluciones" className="transition-colors hover:text-foreground">
            Soluciones
          </Link>
          <Link href="/#marcas" className="transition-colors hover:text-foreground">
            Marcas
          </Link>
          <Link href="/#novedades" className="transition-colors hover:text-foreground">
            Novedades
          </Link>
          <Link href="/#contacto" className="transition-colors hover:text-foreground">
            Contacto
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          {session?.user?.role ? (
            <ButtonLink href={target} size="sm">
              Ir al portal
            </ButtonLink>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
              >
                Acceder
              </Link>
              <ButtonLink href="/login" size="sm">
                <span className="sm:hidden">Portal</span>
                <span className="hidden sm:inline">Portal de clientes</span>
              </ButtonLink>
            </>
          )}
          <PublicMobileMenu />
        </div>
      </div>
    </header>
  );
}
