import Link from "next/link";
import type { ReactNode } from "react";
import type { CatalogBrand } from "@/lib/catalog-brands";

interface AuthShellProps {
  kicker: string;
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  brands: CatalogBrand[];
  total: number;
}

/**
 * Marco de las pantallas de acceso (login, activar cuenta), con el mismo
 * lenguaje que la pantalla del stand: a la izquierda el panel azul con las
 * marcas, a la derecha el formulario centrado sobre blanco. En celular queda
 * solo el formulario y las marcas en una cinta abajo.
 */
export function AuthShell({ kicker, title, subtitle, children, footer, brands, total }: AuthShellProps) {
  const withLogo = brands.filter((b) => b.logoUrl);
  return (
    <div className="grid min-h-dvh bg-[#f3f6fa] text-[#1E3552] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <aside className="relative hidden overflow-hidden bg-[radial-gradient(ellipse_at_30%_20%,#2c4a70_0%,#1E3552_55%,#152740_100%)] text-white lg:flex lg:flex-col lg:items-center lg:justify-between lg:px-14 lg:py-14 lg:text-center">
        <div className="pointer-events-none absolute -right-40 -top-40 h-[30rem] w-[30rem] rounded-full border border-white/10" />
        <div className="pointer-events-none absolute -bottom-56 left-[12%] h-[28rem] w-[28rem] rounded-full border border-white/5" />

        <p className="relative text-[11px] font-semibold uppercase tracking-[0.3em] text-white/60">Portal B2B Soundtec</p>

        <div className="relative flex max-w-xl flex-col items-center">
          <h2 className="text-4xl font-semibold leading-[1.08] tracking-tight xl:text-5xl">
            Precios, stock y cotizaciones de tus marcas, en un solo lugar.
          </h2>
          <p className="mt-5 max-w-md text-base text-white/70">
            Soluciones de audio, video, iluminación y control para integradores e instaladores.
          </p>
        </div>

        <div className="relative w-full max-w-2xl">
          {withLogo.length ? (
            <div className="grid grid-cols-4 gap-2.5 xl:grid-cols-5">
              {withLogo.map((brand) => (
                <div key={brand.id} className="flex h-14 items-center justify-center rounded-xl bg-white/95 px-2.5 shadow-[0_10px_30px_-12px_rgba(0,0,0,0.5)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={brand.logoUrl!} alt={brand.name} className="h-10 w-auto max-w-full object-contain" />
                </div>
              ))}
            </div>
          ) : null}
          <p className="mt-6 text-sm text-white/60">
            <span className="font-semibold text-white">+{total.toLocaleString("es-AR")} productos</span> de {brands.length} marcas
          </p>
        </div>
      </aside>
      {/* min-w-0: la cinta de logos es más ancha que la pantalla. Sin esto la
          columna crece con ella y, en el celular, el formulario queda fuera de la vista. */}
      <div className="flex min-h-dvh min-w-0 flex-col px-6 py-8 sm:px-12 lg:px-16 lg:py-12">
        <Link href="/" className="self-center" aria-label="Soundtec — inicio">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec" className="h-16 w-auto sm:h-20" />
        </Link>

        <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10 text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.3em] text-[#1E3552]/55">{kicker}</p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">{title}</h1>
          {subtitle ? <div className="mt-2 text-sm text-[#1E3552]/65">{subtitle}</div> : null}
          <div className="mt-8 rounded-2xl bg-white p-6 text-left shadow-[0_24px_60px_-20px_rgba(30,53,82,0.25)] ring-1 ring-[#1E3552]/10 sm:p-8">
            {children}
          </div>
          {footer ? <div className="mt-6 space-y-2 text-center text-sm text-[#1E3552]/70">{footer}</div> : null}
        </main>

        {withLogo.length ? (
          <div className="-mx-6 overflow-hidden border-t border-[#1E3552]/10 pt-5 sm:-mx-12 lg:hidden">
            <div className="flex w-max animate-[authMarquee_40s_linear_infinite] items-center gap-10 px-6">
              {[...withLogo, ...withLogo].map((brand, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={`${brand.id}-${i}`} src={brand.logoUrl!} alt={brand.name} className="h-8 w-auto max-w-[8rem] object-contain" />
              ))}
            </div>
          </div>
        ) : null}
      </div>


      <style>{`@keyframes authMarquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }`}</style>
    </div>
  );
}
