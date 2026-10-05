import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { getCatalogBrands, type CatalogBrand } from "@/lib/catalog-brands";
import { qrSvgWithLogo } from "@/server/expo/qr-image";
import { getShowcaseProducts } from "@/server/expo/showcase";
import { Showcase, type ShowcaseSlide } from "./showcase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soundtec · Escaneá el QR", robots: { index: false } };

/**
 * Qué vista se muestra según la orientación. Con AUTO se renderizan las dos y
 * el monitor elige con la variante `landscape:` (Tailwind necesita las clases literales).
 */
const VISIBILITY = {
  LANDSCAPE: { landscape: "flex", portrait: null },
  PORTRAIT: { landscape: null, portrait: "flex" },
  AUTO: { landscape: "hidden landscape:flex", portrait: "flex landscape:hidden" },
} as const;

const KEYFRAMES = `
@keyframes fadeUp { from { opacity: 0; transform: translateY(1.2vmin); } to { opacity: 1; transform: none; } }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes progress { from { width: 0%; } to { width: 100%; } }
@keyframes floatQr { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-0.8vmin); } }
`;

const STEPS = ["Escaneá el código", "Explorá las marcas", "Pedí tu cuenta y accedé a precios y stock"];

interface ViewProps {
  className: string;
  svg: string;
  total: number;
  slides: ShowcaseSlide[];
  brands: CatalogBrand[];
}

/** Pantalla para el televisor del stand. Solo para QR activos. */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ o?: string }>;
}) {
  const { code } = await params;
  const { o } = await searchParams;
  const qr = await prisma.expoQr.findFirst({ where: { code, isActive: true }, include: { event: true } });
  if (!qr) notFound();

  const [svg, allBrands, products] = await Promise.all([
    qrSvgWithLogo(`${appUrl()}/e/${code}`),
    getCatalogBrands(),
    getShowcaseProducts(24, qr.event.showcaseProductIds),
  ]);
  // Merchandising (ropa) no es una marca de equipos: no va en la pantalla.
  const brands = allBrands.filter((b) => !/apparel/i.test(b.name));
  const total = brands.reduce((acc, b) => acc + b.count, 0);
  const logoByBrand = new Map(brands.map((b) => [b.name, b.logoUrl]));
  const slides: ShowcaseSlide[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    brand: p.brand,
    imageUrl: p.imageUrl,
    brandLogo: logoByBrand.get(p.brand) ?? null,
  }));
  // ?o=h / ?o=v fuerza la orientación al abrir la pantalla; si no, la del evento.
  const orientation = o === "h" ? "LANDSCAPE" : o === "v" ? "PORTRAIT" : qr.event.displayOrientation;
  const visibility = VISIBILITY[orientation] ?? VISIBILITY.AUTO;
  const view = { svg, total, slides, brands };

  return (
    <div className="h-dvh overflow-hidden bg-[#f3f6fa] text-[#1E3552]">
      <style>{KEYFRAMES}</style>
      {visibility.landscape ? <LandscapeView className={visibility.landscape} {...view} /> : null}
      {visibility.portrait ? <PortraitView className={visibility.portrait} {...view} /> : null}
    </div>
  );
}

/** Horizontal: a la izquierda la invitación con el QR, a la derecha la vidriera grande. */
function LandscapeView({ className, svg, total, slides, brands }: ViewProps) {
  return (
    <div className={`${className} h-full flex-col`}>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,45fr)_minmax(0,55fr)]">
        <section className="flex min-h-0 flex-col justify-between py-[5vh] pl-[5vw] pr-[3vw]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="h-[11vh] w-auto self-start object-contain" />

          <div className="animate-[fadeUp_900ms_ease-out]">
            <p className="text-[1.9vh] font-semibold uppercase tracking-[0.3em] text-[#1E3552]/55">Catálogo Soundtec</p>
            <h1 className="mt-[1.2vh] text-[6.4vh] font-semibold leading-[1.02] tracking-tight">
              Todo el catálogo,
              <br />
              en tu celular
            </h1>
            <div className="mt-[4.5vh] flex items-center gap-[2.6vw]">
              <div className="shrink-0 animate-[floatQr_6s_ease-in-out_infinite] rounded-[2.4vh] bg-white p-[2vh] shadow-[0_3vh_8vh_rgba(30,53,82,0.22)] ring-1 ring-[#1E3552]/10">
                <div className="w-[min(36vh,19vw)] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
              </div>
              <ol className="min-w-0 space-y-[2.4vh]">
                {STEPS.map((step, i) => (
                  <li key={step} className="flex items-start gap-[1.4vh]">
                    <span className="flex h-[4.2vh] w-[4.2vh] shrink-0 items-center justify-center rounded-full bg-[#1E3552] text-[2vh] font-semibold text-white">
                      {i + 1}
                    </span>
                    <span className="pt-[0.5vh] text-[2.5vh] font-medium leading-snug">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <p className="text-[2.1vh] text-[#1E3552]/65">
            <span className="font-semibold text-[#1E3552]">+{total.toLocaleString("es-AR")} productos</span> de audio, video, iluminación y control
          </p>
        </section>

        <section className="relative flex min-h-0 flex-col overflow-hidden rounded-bl-[5vh] bg-[radial-gradient(ellipse_at_30%_20%,#2c4a70_0%,#1E3552_55%,#152740_100%)] px-[3.5vw] pb-[4.5vh] pt-[4vh]">
          <div className="pointer-events-none absolute -right-[12vh] -top-[12vh] h-[40vh] w-[40vh] rounded-full border border-white/10" />
          <div className="pointer-events-none absolute -bottom-[18vh] left-[10%] h-[36vh] w-[36vh] rounded-full border border-white/5" />
          <p className="relative mb-[2.4vh] text-[1.9vh] font-semibold uppercase tracking-[0.3em] text-white/60">Productos destacados</p>
          <Showcase slides={slides} className="relative min-h-0 flex-1" />
        </section>
      </div>
      <BrandRibbon brands={brands} logoClass="h-[9vh] max-w-[36vh]" />
    </div>
  );
}

/** Vertical: logo grande, QR al centro y la vidriera abajo. */
function PortraitView({ className, svg, total, slides, brands }: ViewProps) {
  return (
    <div className={`${className} h-full flex-col bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f1f4f8_55%,#e4e9f0_100%)]`}>
      <header className="flex justify-center pt-[3.5vmin]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="h-auto max-h-[10.5vh] w-[74vw] object-contain" />
      </header>

      <main className="mx-auto flex min-h-0 w-full flex-1 flex-col items-center justify-center gap-[3vmin] px-[4vmin]">
        <section className="flex flex-col items-center text-center">
          <h1 className="text-[min(4.8vmin,4vh)] font-semibold leading-[1.05] tracking-tight">Todo el catálogo, en tu celular</h1>
          <div className="mt-[2vh] animate-[floatQr_6s_ease-in-out_infinite] rounded-[3vmin] bg-white p-[min(3vmin,2.4vh)] shadow-[0_3vmin_9vmin_rgba(30,53,82,0.22)] ring-1 ring-[#1E3552]/10">
            <div className="w-[min(70vw,33vh,640px)] [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <p className="mt-[2vh] text-[min(3.2vmin,3vh)] font-semibold">Escaneá y explorá</p>
          <p className="mt-[0.6vmin] text-[2vmin] text-[#1E3552]/70">
            Más de {total.toLocaleString("es-AR")} productos de audio, video y control
          </p>
          <p className="mt-[2.2vmin] rounded-full bg-[#1E3552] px-[2.8vmin] py-[1.1vmin] text-[1.8vmin] font-medium text-white">
            Pedí tu cuenta y accedé a precios y stock
          </p>
        </section>
        <Showcase slides={slides} className="h-[21vh] w-full" />
      </main>

      <BrandRibbon brands={brands} logoClass="h-[min(8vmin,7vh)] max-w-[32vmin]" />
    </div>
  );
}

/** Cinta de logos; se duplica para que el desplazamiento sea infinito sin saltos. */
function BrandRibbon({ brands, logoClass }: { brands: CatalogBrand[]; logoClass: string }) {
  const ribbon = [...brands, ...brands];
  return (
    <footer className="relative mt-[2vh] shrink-0 overflow-hidden border-t border-[#1E3552]/10 bg-white/80 py-[min(2.4vmin,2vh)]">
      <div className="flex w-max animate-[marquee_50s_linear_infinite] items-center gap-[8vmin] px-[4vmin]">
        {ribbon.map((brand, i) =>
          brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={`${brand.id}-${i}`} src={brand.logoUrl} alt={brand.name} className={`${logoClass} w-auto object-contain`} />
          ) : (
            <span key={`${brand.id}-${i}`} className="whitespace-nowrap text-[2.4vmin] font-bold tracking-[0.18em] text-[#1E3552]/70">
              {brand.name.toUpperCase()}
            </span>
          )
        )}
      </div>
    </footer>
  );
}
