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
  let appName = "Soundtec";
  try {
    appName = (await getSetting("app.name", "Soundtec")) || "Soundtec";
  } catch {
    appName = "Soundtec";
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/65">
      <div className="container-page relative flex h-16 min-w-0 items-center justify-between gap-2">
        <Link href="/" className="flex min-w-0 items-center" aria-label={appName}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec" className="h-10 w-auto max-w-[9.5rem] object-contain sm:h-11 sm:max-w-none" />
        </Link>

        <nav className="hidden gap-6 text-sm text-muted-foreground md:flex">
          <Link href="/catalogo" className="font-medium text-foreground transition-colors hover:text-accent">
            Catálogo
          </Link>
          <Link href="/#como-funciona" className="transition-colors hover:text-foreground">
            Cómo funciona
          </Link>
          <Link href="/#plataforma" className="transition-colors hover:text-foreground">
            Plataforma
          </Link>
          <Link href="/#soluciones" className="transition-colors hover:text-foreground">
            Soluciones
          </Link>
          <Link href="/#marcas" className="transition-colors hover:text-foreground">
            Marcas
          </Link>
          <Link href="/#acceso" className="transition-colors hover:text-foreground">
            Contacto
          </Link>
        </nav>

        <div className="flex shrink-0 items-center gap-2">
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
