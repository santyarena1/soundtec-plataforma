/* eslint-disable @next/next/no-img-element */
import type { CatalogBrand } from "@/lib/catalog-brands";

interface BrandsProps {
  /** Marcas visibles del catálogo (con su logo): todas van en «Representación exclusiva». */
  catalogBrands: CatalogBrand[];
}

interface LandingLogo {
  key: string;
  name: string;
  src: string;
  /** Logos casi cuadrados: más alto para que se lean igual que los apaisados. */
  tall?: boolean;
}

/**
 * Representadas con logo propio (de soundtec.com.ar), en el orden de siempre.
 * Las demás marcas del catálogo se suman detrás con el logo cargado en
 * Admin → Marcas.
 */
const EXCLUSIVE: Array<{ file: string; name: string; aliases?: string[] }> = [
  { file: "crestron.png", name: "Crestron" },
  { file: "crestron_home.png", name: "Crestron Home" },
  { file: "dante.png", name: "Dante", aliases: ["Audinate"] },
  { file: "atlona.png", name: "Atlona" },
  { file: "soundtube.png", name: "SoundTube" },
  { file: "blaze.png", name: "Blaze Audio", aliases: ["BLAZE BY SONANCE", "Blaze"] },
  { file: "bluesoundprofessional.png", name: "Bluesound Professional", aliases: ["Bluesound"] },
  { file: "ndt.png", name: "NDT" },
  { file: "flatpanel.png", name: "FlatPanel Audio", aliases: ["Flat Panel Audio", "Flatpanel"] },
];

/** Partners (logos oficiales de cada marca). */
const PARTNERS: LandingLogo[] = [
  { key: "yamaha", name: "Yamaha", src: "/landing/brands/yamaha.png" },
  { key: "shure", name: "Shure", src: "/landing/brands/shure.png" },
  { key: "barco", name: "Barco", src: "/landing/brands/barco.png" },
  { key: "poly", name: "HP Poly", src: "/landing/brands/poly.png" },
  { key: "ricoh", name: "Ricoh", src: "/landing/brands/ricoh.svg" },
  { key: "hk-audio", name: "HK Audio", src: "/landing/brands/hk-audio.svg", tall: true },
  { key: "work-pro", name: "Work Pro", src: "/landing/brands/work-pro.png", tall: true },
];

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Logos de «Representación exclusiva»: los de siempre y, detrás, el resto de las marcas del catálogo. */
export function exclusiveLogos(catalogBrands: CatalogBrand[]): LandingLogo[] {
  const fixed = EXCLUSIVE.map((brand) => ({
    key: normalize(brand.name),
    name: brand.name,
    src: `/landing/brands/${brand.file}`,
    names: [brand.name, ...(brand.aliases ?? [])].map(normalize),
  }));
  const taken = new Set(fixed.flatMap((brand) => brand.names));
  const fromCatalog = catalogBrands
    .filter((brand) => brand.logoUrl && !taken.has(normalize(brand.name)))
    .map((brand) => ({ key: brand.id, name: brand.name, src: brand.logoUrl as string }));
  return [...fixed.map(({ key, name, src }) => ({ key, name, src })), ...fromCatalog];
}

export function Brands({ catalogBrands }: BrandsProps) {
  const exclusive = exclusiveLogos(catalogBrands);

  return (
    <section id="marcas" className="border-y border-border bg-card py-20 sm:py-24">
      <div className="container-page">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Marcas</p>
            <h2 className="mt-3 text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
              Representantes exclusivos y partners de las marcas líderes.
            </h2>
          </div>
          <p className="muted-text max-w-sm md:text-right">
            El catálogo completo con precios por marca está dentro del portal.
          </p>
        </div>

        <p className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Representación exclusiva en Argentina
        </p>
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {exclusive.map((brand) => (
            <li
              key={brand.key}
              className="flex h-20 items-center justify-center rounded-xl border border-accent/25 bg-background px-5 transition-colors hover:border-accent/60"
            >
              <img src={brand.src} alt={brand.name} className="max-h-9 w-auto max-w-full object-contain" loading="lazy" />
            </li>
          ))}
        </ul>

        <p className="mt-10 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Partners</p>
        <ul className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {PARTNERS.map((brand) => (
            <li
              key={brand.key}
              className="flex h-16 items-center justify-center rounded-xl border border-border bg-background px-4 opacity-80 transition-opacity hover:opacity-100"
            >
              <img
                src={brand.src}
                alt={brand.name}
                className={`${brand.tall ? "max-h-10" : "max-h-7"} w-auto max-w-full object-contain`}
                loading="lazy"
              />
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
