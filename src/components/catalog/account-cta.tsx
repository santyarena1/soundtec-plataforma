import Link from "next/link";
import { ArrowRight, LockOpen } from "lucide-react";

/** Botón fijo abajo (mobile) / franja (desktop) del catálogo público. */
export function StickyAccountCta() {
  return (
    <>
      <div className="h-20 sm:hidden" aria-hidden="true" />
      <Link
        href="/solicitar-cuenta"
        className="fixed inset-x-3 bottom-3 z-30 flex items-center justify-between rounded-2xl bg-primary px-4 py-3 text-primary-foreground shadow-lg shadow-primary/30 sm:hidden"
      >
        <span>
          <span className="block text-sm font-semibold">¿Querés ver precios?</span>
          <span className="text-xs opacity-90">Solicitá tu cuenta de cliente</span>
        </span>
        <ArrowRight className="h-5 w-5" />
      </Link>
      <div className="mb-6 hidden items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 px-5 py-4 sm:flex">
        <p className="text-sm"><strong>¿Querés ver precios y stock?</strong> Pedí tu cuenta de cliente en un minuto.</p>
        <Link href="/solicitar-cuenta" className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground">
          Solicitar cuenta de cliente
        </Link>
      </div>
    </>
  );
}

/** Bloque destacado en la ficha, donde iría el precio. */
export function ProductAccountCta() {
  return (
    <div className="rounded-2xl border-2 border-primary bg-card p-5">
      <p className="flex items-center gap-2 font-semibold"><LockOpen className="h-4 w-4" /> Precio para clientes</p>
      <p className="mt-1 text-sm text-muted-foreground">Creá tu cuenta y accedé a precios, stock y cotizaciones.</p>
      <Link href="/solicitar-cuenta" className="mt-4 flex h-12 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
        Solicitar cuenta de cliente
      </Link>
      <p className="mt-3 text-center text-xs text-muted-foreground">
        ¿Ya tenés cuenta? <Link href="/login" className="underline">Ingresá</Link>
      </p>
    </div>
  );
}
