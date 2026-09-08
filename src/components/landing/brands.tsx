/* eslint-disable @next/next/no-img-element */

interface BrandsProps {
  catalogBrands: Array<{ id: string; name: string }>;
}

/** Marcas que Soundtec representa (logos propios de soundtec.com.ar). */
const REPRESENTED = [
  { file: "crestron.png", name: "Crestron", exclusive: true },
  { file: "crestron_home.png", name: "Crestron Home", exclusive: true },
  { file: "dante.png", name: "Dante", exclusive: true },
  { file: "atlona.png", name: "Atlona", exclusive: true },
  { file: "soundtube.png", name: "SoundTube", exclusive: true },
  { file: "blaze.png", name: "Blaze Audio", exclusive: true },
  { file: "bluesoundprofessional.png", name: "Bluesound Professional", exclusive: true },
  { file: "ndt.png", name: "NDT", exclusive: true },
  { file: "flatpanel.png", name: "Flatpanel Audio", exclusive: true },
  { file: "yamaha.png", name: "Yamaha" },
  { file: "jbl.png", name: "JBL" },
  { file: "shure.png", name: "Shure" },
  { file: "qsc.png", name: "QSC" },
  { file: "kramer.png", name: "Kramer" },
  { file: "barco.png", name: "Barco" },
  { file: "poly.png", name: "HP Poly" },
  { file: "epson.png", name: "Epson" },
  { file: "samsung.png", name: "Samsung" },
  { file: "lg_electronics.png", name: "LG" },
  { file: "l-acoustics.png", name: "L-Acoustics" },
  { file: "bose.png", name: "Bose" },
  { file: "logitech.png", name: "Logitech" },
] as const;

export function Brands({ catalogBrands }: BrandsProps) {
  const exclusive = REPRESENTED.filter((brand) => "exclusive" in brand && brand.exclusive);
  const partners = REPRESENTED.filter((brand) => !("exclusive" in brand && brand.exclusive));
  const shownNames = new Set(REPRESENTED.map((brand) => brand.name.toLowerCase()));
  const extraBrands = catalogBrands.filter((brand) => !shownNames.has(brand.name.toLowerCase()));

  return (
    <section id="marcas" className="border-y border-border bg-card py-20 sm:py-24">
      <div className="container-page">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Marcas</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Representantes exclusivos y partners de las marcas líderes.
            </h2>
          </div>
          <p className="muted-text max-w-sm md:text-right">
            El catálogo completo con precios y stock por marca está dentro del portal.
          </p>
        </div>

        <p className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Representación exclusiva en Argentina
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {exclusive.map((brand) => (
            <li
              key={brand.file}
              className="flex h-20 items-center justify-center rounded-xl border border-accent/25 bg-background px-5 transition-colors hover:border-accent/60"
            >
              <img
                src={`/landing/brands/${brand.file}`}
                alt={brand.name}
                className="max-h-9 w-auto max-w-full object-contain"
                loading="lazy"
              />
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Partners</p>
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {partners.map((brand) => (
            <li
              key={brand.file}
              className="flex h-16 items-center justify-center rounded-xl border border-border bg-background px-4 opacity-80 transition-opacity hover:opacity-100"
            >
              <img
                src={`/landing/brands/${brand.file}`}
                alt={brand.name}
                className="max-h-7 w-auto max-w-full object-contain"
                loading="lazy"
              />
            </li>
          ))}
        </ul>

        {extraBrands.length > 0 ? (
          <div className="mt-8 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span className="mr-1">También en el portal:</span>
            {extraBrands.map((brand) => (
              <span key={brand.id} className="rounded-full border border-border px-3 py-1 text-foreground">
                {brand.name}
              </span>
            ))}
            <span>y más de 40 fabricantes.</span>
          </div>
        ) : (
          <p className="mt-8 text-sm text-muted-foreground">Y más de 40 fabricantes disponibles a pedido.</p>
        )}
      </div>
    </section>
  );
}
