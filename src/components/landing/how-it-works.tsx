import { FileText, ListChecks, Search, Send } from "lucide-react";

const STEPS = [
  {
    icon: Search,
    title: "Buscá en el catálogo",
    text: "Miles de productos con fichas técnicas completas: especificaciones, imágenes en alta, documentos, accesorios compatibles y qué viene incluido en la caja.",
  },
  {
    icon: ListChecks,
    title: "Armá tu pedido",
    text: "Sumá cantidades, configurá opciones y accesorios, y guardá listas por proyecto. El precio que ves ya tiene las condiciones de tu cuenta.",
  },
  {
    icon: Send,
    title: "Enviálo al equipo",
    text: "Con un clic tu pedido llega a Soundtec. Podés adjuntar el contexto del proyecto y conversar por el mismo canal.",
  },
  {
    icon: FileText,
    title: "Recibí la cotización",
    text: "Te devolvemos una cotización formal en PDF, con seguimiento de estado en el portal y todo el historial guardado.",
  },
] as const;

export function HowItWorks() {
  return (
    <section id="como-funciona" className="container-page py-20 sm:py-24">
      <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Cómo funciona</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            De la búsqueda a la cotización, sin mails ni planillas.
          </h2>
          <p className="muted-text mt-4 text-base">
            El portal reemplaza el ida y vuelta de listas de precios en Excel. Todo lo que necesitás para
            presupuestar un proyecto está en un solo lugar y siempre actualizado.
          </p>
        </div>

        <ol className="relative grid gap-4 sm:grid-cols-2">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-elevated"
            >
              <div className="flex items-center justify-between">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                  <step.icon className="h-5 w-5" />
                </span>
                <span className="text-3xl font-semibold tabular-nums text-border transition-colors group-hover:text-accent/40">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold tracking-tight">{step.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
