import Link from "next/link";
import { ArrowRight, Clock } from "lucide-react";
import { brandInquiryHref } from "@/lib/catalog-brands";

/** Marca en «Próximamente» (Admin → Marcas): aviso al entrar, con la consulta a mano. */
export function ComingSoonBanner({ brand }: { brand: { id: string; name: string; logoUrl: string | null } }) {
  return (
    <section className="flex flex-col items-start gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/5 via-card to-card p-6 sm:flex-row sm:items-center sm:gap-6 sm:p-8">
      {brand.logoUrl ? (
        <span className="flex h-20 w-40 shrink-0 items-center justify-center rounded-xl border border-border bg-white px-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={brand.logoUrl} alt={brand.name} className="max-h-12 max-w-full object-contain" />
        </span>
      ) : null}
      <div className="min-w-0 flex-1">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-primary-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" /> Próximamente
        </p>
        <h2 className="mt-2 text-xl font-semibold leading-snug sm:text-2xl">
          Próximamente vas a encontrar acá todo el lineup de {brand.name}.
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Mientras tanto, si necesitás algo de {brand.name}, consultanos y te pasamos disponibilidad y precio.</p>
      </div>
      <Link
        href={brandInquiryHref(brand.id)}
        className="inline-flex h-10 shrink-0 items-center gap-2 rounded-md border border-primary/30 bg-card px-4 text-sm font-medium text-primary hover:bg-primary/10"
      >
        Consultar por {brand.name} <ArrowRight className="h-4 w-4" />
      </Link>
    </section>
  );
}
