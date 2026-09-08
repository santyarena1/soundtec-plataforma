import { BadgePercent, BookOpen, Boxes, History, Layers, Warehouse } from "lucide-react";

const FEATURES = [
  {
    icon: BadgePercent,
    title: "Precios de tu cuenta",
    text: "Cada cliente ve su propia lista: márgenes, descuentos por marca o familia y promociones del fabricante aplicadas automáticamente. En USD, sin sorpresas.",
    span: "lg:col-span-2",
    dark: true,
  },
  {
    icon: Warehouse,
    title: "Stock y disponibilidad",
    text: "Disponibilidad real por depósito y fecha estimada de fábrica cuando no hay stock.",
  },
  {
    icon: BookOpen,
    title: "Fichas técnicas completas",
    text: "Especificaciones por grupo, dimensiones, peso, imágenes en alta, spec sheets, manuales, CAD y Revit. Lo mismo que en el sitio del fabricante, en español.",
  },
  {
    icon: Boxes,
    title: "Accesorios y compatibilidad",
    text: "Qué viene incluido en la caja, qué accesorios necesita y qué variantes existen. Menos errores al presupuestar.",
  },
  {
    icon: Layers,
    title: "Listas por proyecto",
    text: "Favoritos y listas separadas por obra o cliente final para volver a cotizar en segundos.",
  },
  {
    icon: History,
    title: "Historial de pedidos y cotizaciones",
    text: "Todo lo que pediste y lo que te cotizamos queda guardado con su estado y sus PDFs.",
    span: "lg:col-span-2",
  },
] as const;

export function Features() {
  return (
    <section id="plataforma" className="border-y border-border bg-secondary/40 py-20 sm:py-24">
      <div className="container-page">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Qué tenés dentro</p>
          <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
            Un portal pensado para quien presupuesta todos los días.
          </h2>
          <p className="muted-text mt-4 text-base">
            No es un e-commerce: es tu herramienta de trabajo con Soundtec. Información técnica confiable y precios
            que podés pasar a tu propio cliente.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((feature) => (
            <article
              key={feature.title}
              className={`relative overflow-hidden rounded-2xl border p-6 transition-all hover:-translate-y-0.5 hover:shadow-elevated ${
                "dark" in feature && feature.dark
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card"
              } ${"span" in feature ? feature.span : ""}`}
            >
              {"dark" in feature && feature.dark ? (
                <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-accent/30 blur-3xl" aria-hidden />
              ) : null}
              <span
                className={`relative flex h-10 w-10 items-center justify-center rounded-lg ${
                  "dark" in feature && feature.dark
                    ? "bg-primary-foreground/10 text-primary-foreground"
                    : "bg-primary/10 text-primary"
                }`}
              >
                <feature.icon className="h-5 w-5" />
              </span>
              <h3 className="relative mt-5 text-lg font-semibold tracking-tight">{feature.title}</h3>
              <p
                className={`relative mt-2 text-sm leading-relaxed ${
                  "dark" in feature && feature.dark ? "text-primary-foreground/75" : "text-muted-foreground"
                }`}
              >
                {feature.text}
              </p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
