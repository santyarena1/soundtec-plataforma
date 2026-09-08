import Link from "next/link";
import { ArrowRight, Check, Search, ShoppingBag } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

interface HeroProps {
  title?: string | null;
  subtitle?: string | null;
  ctaText?: string | null;
  ctaUrl?: string | null;
  productCount: number;
  brandCount: number;
}

const DEFAULT_TITLE = "Tu catálogo audiovisual profesional, con tus precios, listo para cotizar.";
const DEFAULT_SUBTITLE =
  "La plataforma de Soundtec para integradores, instaladores y empresas: buscá productos de las marcas que representamos, mirá precio y disponibilidad según tu cuenta, armá tu pedido y recibí la cotización formal sin salir del portal.";

export function LandingHero({ title, subtitle, ctaText, ctaUrl, productCount, brandCount }: HeroProps) {
  return (
    <section className="relative overflow-hidden bg-primary text-primary-foreground">
      <div className="landing-grid pointer-events-none absolute inset-0 opacity-[0.35]" aria-hidden />
      <div className="pointer-events-none absolute -right-40 top-10 h-[520px] w-[520px] rounded-full bg-accent/25 blur-[120px]" aria-hidden />
      <div className="pointer-events-none absolute -left-32 bottom-0 h-72 w-72 rounded-full bg-primary-foreground/10 blur-3xl" aria-hidden />

      <div className="container-page relative grid gap-12 py-16 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-primary-foreground/80">
            <span className="h-1.5 w-1.5 rounded-full bg-accent" />
            Soundtec · Plataforma para clientes
          </p>
          <h1 className="mt-6 text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
            {title || DEFAULT_TITLE}
          </h1>
          <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-primary-foreground/75 sm:text-lg">
            {subtitle || DEFAULT_SUBTITLE}
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <ButtonLink href={ctaUrl || "/login"} size="lg" className="bg-accent text-accent-foreground hover:bg-accent/90">
              {ctaText || "Ingresar al portal"} <ArrowRight className="h-4 w-4" />
            </ButtonLink>
            <Link
              href="#acceso"
              className="inline-flex h-11 items-center rounded-md border border-primary-foreground/25 px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              Quiero una cuenta
            </Link>
          </div>

          <dl className="mt-12 grid grid-cols-3 gap-6 border-t border-primary-foreground/15 pt-6">
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-primary-foreground/55">Productos</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{productCount > 0 ? `+${productCount.toLocaleString("es-AR")}` : "Catálogo vivo"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-primary-foreground/55">Marcas</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">{brandCount > 0 ? `+${brandCount}` : "Líderes"}</dd>
            </div>
            <div>
              <dt className="text-[11px] uppercase tracking-wider text-primary-foreground/55">Respuesta</dt>
              <dd className="mt-1 text-2xl font-semibold">24–48 hs</dd>
            </div>
          </dl>
        </div>

        <PortalMockup />
      </div>
    </section>
  );
}

/** Maqueta estática del portal: muestra lo que ve un cliente sin necesitar login. */
function PortalMockup() {
  return (
    <div className="relative mx-auto w-full max-w-lg lg:max-w-none" aria-hidden>
      <div className="absolute -inset-4 -z-10 rounded-[28px] bg-gradient-to-br from-accent/30 via-transparent to-transparent blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-primary-foreground/15 bg-background text-foreground shadow-2xl">
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="h-2.5 w-2.5 rounded-full bg-border" />
          <span className="ml-3 truncate rounded-md bg-background px-2 py-0.5 text-[11px] text-muted-foreground">
            portal.soundtec · catálogo
          </span>
        </div>

        <div className="p-4 sm:p-5">
          <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm text-muted-foreground shadow-card">
            <Search className="h-4 w-4" />
            <span>DM NVX 4K60 encoder</span>
            <span className="ml-auto rounded bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-foreground">Buscar</span>
          </div>

          <div className="mt-3 grid gap-3">
            <MockProduct
              name="DM-NVX-360"
              brand="Crestron"
              subtitle="Encoder/decoder AV sobre IP 4K60 4:4:4"
              price="USD 1.842,00"
              stock="En stock · Miami"
              highlighted
            />
            <MockProduct
              name="DM-NVX-E30"
              brand="Crestron"
              subtitle="Encoder AV sobre IP 4K60"
              price="USD 1.215,00"
              stock="En stock · Laredo"
            />
          </div>

          <div className="mt-3 flex items-center justify-between rounded-lg bg-primary px-3 py-2.5 text-primary-foreground">
            <div className="flex items-center gap-2 text-sm">
              <ShoppingBag className="h-4 w-4" />
              <span className="font-medium">Mi pedido</span>
              <span className="text-primary-foreground/70">· 3 productos</span>
            </div>
            <span className="text-sm font-semibold tabular-nums">USD 4.899,00</span>
          </div>
        </div>
      </div>

      <div className="absolute -bottom-10 -left-3 hidden rounded-xl border border-border bg-card px-4 py-3 text-sm shadow-elevated sm:block">
        <p className="flex items-center gap-2 font-medium text-foreground">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-success/15 text-success">
            <Check className="h-3 w-3" />
          </span>
          Cotización COT-2041 emitida
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">PDF listo · precios de tu cuenta</p>
      </div>
    </div>
  );
}

function MockProduct({
  name,
  brand,
  subtitle,
  price,
  stock,
  highlighted,
}: {
  name: string;
  brand: string;
  subtitle: string;
  price: string;
  stock: string;
  highlighted?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border bg-card p-3 ${
        highlighted ? "border-accent/50 ring-1 ring-accent/30" : "border-border"
      }`}
    >
      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-secondary text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {brand.slice(0, 3)}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{brand}</p>
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold tabular-nums">{price}</p>
        <p className="text-[11px] text-success">{stock}</p>
      </div>
    </div>
  );
}
