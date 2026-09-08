import { Building2, HardHat, Home, PenTool } from "lucide-react";

const AUDIENCES = [
  {
    icon: HardHat,
    title: "Integradores e instaladores AV",
    text: "Presupuestá obras completas con precio, stock y compatibilidad verificada. Reutilizá listas por proyecto.",
  },
  {
    icon: Home,
    title: "Instaladores Crestron Home",
    text: "Catálogo residencial con procesadores, teclados, iluminación y cortinas, con los accesorios que cada sistema necesita.",
  },
  {
    icon: PenTool,
    title: "Estudios y consultoras",
    text: "Fichas técnicas, CAD y Revit para especificar en planos y pliegos con información oficial del fabricante.",
  },
  {
    icon: Building2,
    title: "Empresas y organismos",
    text: "Salas de reunión, auditorios y edificios: pedí cotización de equipamiento con seguimiento y trazabilidad.",
  },
] as const;

const SECTORS = [
  "Corporativo",
  "Educación",
  "Arte y museos",
  "Broadcast y estudios",
  "Gobierno",
  "Hotelería y gastronomía",
  "Salud",
  "Residencial",
  "Culto",
  "Transporte",
  "Retail y cartelería",
  "Rental y eventos",
] as const;

export function AudiencesAndSectors() {
  return (
    <section id="soluciones" className="container-page py-20 sm:py-24">
      <div className="grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-16">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Para quién</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Hecho para profesionales que compran para terceros.
          </h2>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {AUDIENCES.map((audience) => (
              <li key={audience.title} className="rounded-xl border border-border bg-card p-5">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 text-accent">
                  <audience.icon className="h-[18px] w-[18px]" />
                </span>
                <h3 className="mt-4 font-semibold tracking-tight">{audience.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{audience.text}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl border border-border bg-gradient-to-b from-card to-secondary/40 p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Sectores que integramos</p>
          <h3 className="mt-3 text-2xl font-semibold tracking-tight">
            Audio, video, iluminación, videoconferencia y control inteligente.
          </h3>
          <p className="muted-text mt-3">
            Soundtec es integrador y distribuidor: diseñamos, proveemos, instalamos y damos soporte. El portal es la
            puerta de entrada a ese mismo equipo.
          </p>
          <ul className="mt-6 flex flex-wrap gap-2">
            {SECTORS.map((sector) => (
              <li
                key={sector}
                className="rounded-full border border-border bg-background px-3.5 py-1.5 text-sm font-medium text-foreground"
              >
                {sector}
              </li>
            ))}
          </ul>
          <dl className="mt-8 grid grid-cols-2 gap-4 border-t border-border pt-6 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Certificación</dt>
              <dd className="mt-1 font-semibold">ISO 9001 · primera empresa AV de Argentina</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wider text-muted-foreground">Membresía</dt>
              <dd className="mt-1 font-semibold">AVIXA</dd>
            </div>
          </dl>
        </div>
      </div>
    </section>
  );
}
