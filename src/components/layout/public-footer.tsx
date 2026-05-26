import Link from "next/link";

export function PublicFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-card">
      <div className="container-page grid gap-8 py-12 md:grid-cols-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground text-sm font-bold">
              S
            </span>
            <p className="font-semibold">Soundtec S.R.L.</p>
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            Integración audiovisual profesional. Asesoramiento técnico, diseño, instalación y servicio post-venta.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold">Soluciones</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Audio profesional</li>
            <li>Video y videoconferencia</li>
            <li>Iluminación arquitectónica y escénica</li>
            <li>Automatización y control</li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Sectores</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Corporativo</li>
            <li>Educación</li>
            <li>Cultural y broadcast</li>
            <li>Retail y eventos</li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Portal</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <Link href="/login" className="hover:text-foreground">
                Acceso a clientes
              </Link>
            </li>
            <li>
              <a href="mailto:contacto@soundtec.com.ar" className="hover:text-foreground">
                contacto@soundtec.com.ar
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border bg-background/60">
        <div className="container-page flex flex-col items-start justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Soundtec S.R.L. — Todos los derechos reservados.</p>
          <p>Argentina · Operación B2B</p>
        </div>
      </div>
    </footer>
  );
}
