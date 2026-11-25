import { FileText, Percent, Search, Send } from "lucide-react";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";

/** Pasos 03 y 04 dependen de los pedidos del portal: mientras estén pausados, llevan «Próximamente». */
const STEPS = [
  {
    icon: Search,
    title: "Buscá en el catálogo",
    text: "Miles de productos con fichas técnicas, imágenes, documentación, accesorios compatibles y mucho más. Agregá tus favoritos para encontrarlos rápidamente.",
    soon: false,
  },
  {
    icon: Percent,
    title: "Activá tus descuentos",
    text: "Debajo de Rubros, hacé clic en «Activá tus descuentos» para ver los precios con las condiciones comerciales acordadas con tu empresa. Si no los activás, verás los precios de lista.",
    soon: false,
  },
  {
    icon: Send,
    title: "Envialo al equipo",
    text: "En cualquier momento, envianos tu selección en forma de pedido y contanos sobre el proyecto. Nuestro equipo te responderá con una cotización, sin compromiso de compra.",
    soon: !CUSTOMER_ORDERS_ENABLED,
  },
  {
    icon: FileText,
    title: "Recibí tu cotización",
    text: "Recibí tu cotización formal en PDF y seguí su estado. Si el proyecto avanza, confirmá el pedido. Todo queda guardado.",
    soon: !CUSTOMER_ORDERS_ENABLED,
  },
] as const;

export function HowItWorks() {
  return (
    <section id="como-funciona" className="container-page py-20 sm:py-24">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:gap-16">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Cómo funciona</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            De la búsqueda a la cotización, sin mails ni planillas.
          </h2>
          <p className="muted-text mt-4 text-base">
            El portal SOUNDTEC reemplaza las interminables listas de precios por una plataforma online, siempre
            actualizada. Consultá precios, stock y prepará tus pedidos, con nuestro equipo de especialistas para
            ayudarte.
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
                <span className="text-3xl font-semibold tabular-nums text-border transition-colors group-hover:text-primary/40">
                  0{index + 1}
                </span>
              </div>
              <h3 className="mt-5 flex flex-wrap items-baseline gap-x-2 text-lg font-semibold tracking-tight">
                {step.title}
                {step.soon ? (
                  <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">Próximamente</span>
                ) : null}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
