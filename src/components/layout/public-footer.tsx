/* eslint-disable @next/next/no-img-element */
import Link from "next/link";

const CONTACT = {
  email: "info@soundtec.com.ar",
  phone: "(+54 11) 4586-0400",
  phoneHref: "tel:+541145860400",
  address: "Av. Donato Álvarez 1526, C1416 CABA, Argentina",
  site: "https://www.soundtec.com.ar",
} as const;

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-card">
      <div className="container-page grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <img
            src="/landing/logo_soundtec.png"
            alt="Soundtec — integramos tecnología"
            className="h-12 w-auto"
            loading="lazy"
          />
          <p className="mt-4 max-w-sm text-sm leading-relaxed text-muted-foreground">
            Integrador audiovisual y distribuidor de marcas líderes. Diseño, provisión, instalación y soporte de
            sistemas de audio, video, iluminación, videoconferencia y control inteligente.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <img src="/landing/certificacion_iso9001.png" alt="Certificación ISO 9001" className="h-10 w-auto" loading="lazy" />
            <img src="/landing/member_avixa.png" alt="Miembro AVIXA" className="h-10 w-auto" loading="lazy" />
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold">Plataforma</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li><Link href="/#como-funciona" className="hover:text-foreground">Cómo funciona</Link></li>
            <li><Link href="/#plataforma" className="hover:text-foreground">Qué incluye</Link></li>
            <li><Link href="/#marcas" className="hover:text-foreground">Marcas</Link></li>
            <li><Link href="/login" className="hover:text-foreground">Acceso a clientes</Link></li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Soluciones</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>Audio profesional</li>
            <li>Video y videoconferencia</li>
            <li>Iluminación</li>
            <li>Automatización y control</li>
            <li>Rental y eventos</li>
          </ul>
        </div>

        <div>
          <p className="text-sm font-semibold">Contacto</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            <li>
              <a href={CONTACT.phoneHref} className="hover:text-foreground">{CONTACT.phone}</a>
            </li>
            <li>
              <a href={`mailto:${CONTACT.email}`} className="hover:text-foreground">{CONTACT.email}</a>
            </li>
            <li>{CONTACT.address}</li>
            <li>
              <a href={CONTACT.site} target="_blank" rel="noreferrer" className="hover:text-foreground">
                soundtec.com.ar
              </a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border bg-background/60">
        <div className="container-page flex flex-col items-start justify-between gap-2 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} Soundtec S.R.L. — Todos los derechos reservados.</p>
          <p>Buenos Aires, Argentina · Plataforma B2B para clientes</p>
        </div>
      </div>
    </footer>
  );
}
