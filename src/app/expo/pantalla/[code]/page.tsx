import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { getCatalogBrands } from "@/lib/catalog-brands";
import { qrSvgWithLogo } from "@/server/expo/qr-image";
import { getShowcaseProducts } from "@/server/expo/showcase";
import { Showcase, type ShowcaseSlide } from "./showcase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soundtec · Escaneá el QR", robots: { index: false } };

/**
 * Clases literales por orientación (Tailwind necesita verlas escritas).
 * Horizontal: vidriera | QR | vidriera. Vertical: QR al centro y la vidriera abajo.
 * AUTO sigue al monitor con la variante `landscape:`.
 */
const LAYOUT = {
  LANDSCAPE: {
    grid: "grid-cols-[1fr_auto_1fr]",
    side: "block",
    bottom: "hidden",
    qr: "w-[min(30vw,50vh,640px)]",
  },
  PORTRAIT: {
    grid: "grid-cols-1",
    side: "hidden",
    bottom: "block",
    qr: "w-[min(70vw,36vh,640px)]",
  },
  AUTO: {
    grid: "grid-cols-1 landscape:grid-cols-[1fr_auto_1fr]",
    side: "hidden landscape:block",
    bottom: "block landscape:hidden",
    qr: "w-[min(70vw,36vh,640px)] landscape:w-[min(30vw,50vh,640px)]",
  },
} as const;

const KEYFRAMES = `
@keyframes fadeUp { from { opacity: 0; transform: translateY(1.2vmin); } to { opacity: 1; transform: none; } }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@keyframes progress { from { width: 0%; } to { width: 100%; } }
@keyframes floatQr { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-0.8vmin); } }
`;

/** Pantalla para el televisor del stand. Solo para QR activos. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
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
  // Dos vidrieras a los costados del QR: se reparten los productos.
  const left = slides.filter((_, i) => i % 2 === 0);
  const right = slides.filter((_, i) => i % 2 === 1);
  const layout = LAYOUT[qr.event.displayOrientation] ?? LAYOUT.AUTO;
  // La cinta de marcas se duplica para que el desplazamiento sea infinito sin saltos.
  const ribbon = [...brands, ...brands];

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_center,#ffffff_0%,#f1f4f8_55%,#e4e9f0_100%)] text-[#1E3552]">
      <style>{KEYFRAMES}</style>

      <header className="flex justify-center pt-[3.5vmin]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="h-[min(5.5vmin,5vh)] w-auto" />
      </header>

      <main className={`mx-auto grid min-h-0 w-full max-w-[1900px] flex-1 content-center items-center gap-[3vmin] px-[4vmin] ${layout.grid}`}>
        <div className={layout.side}>
          <Showcase slides={left.length ? left : slides} className="h-[58vh] w-full" />
        </div>

        <section className="flex flex-col items-center text-center">
          <h1 className="text-[min(4.8vmin,4vh)] font-semibold leading-[1.05] tracking-tight">Todo el catálogo, en tu celular</h1>
          <div className="mt-[2vh] animate-[floatQr_6s_ease-in-out_infinite] rounded-[3vmin] bg-white p-[min(3vmin,2.4vh)] shadow-[0_3vmin_9vmin_rgba(30,53,82,0.22)] ring-1 ring-[#1E3552]/10">
            <div className={`${layout.qr} [&>svg]:h-auto [&>svg]:w-full`} dangerouslySetInnerHTML={{ __html: svg }} />
          </div>
          <p className="mt-[2vh] text-[min(3.2vmin,3vh)] font-semibold">Escaneá y explorá</p>
          <p className="mt-[0.6vmin] text-[2vmin] text-[#1E3552]/70">
            Más de {total.toLocaleString("es-AR")} productos de audio, video y control
          </p>
          <p className="mt-[2.2vmin] rounded-full bg-[#1E3552] px-[2.8vmin] py-[1.1vmin] text-[1.8vmin] font-medium text-white">
            Pedí tu cuenta y accedé a precios y stock
          </p>
        </section>

        <div className={layout.side}>
          <Showcase slides={right.length ? right : slides} delayMs={2500} className="h-[58vh] w-full" />
        </div>

        <div className={`${layout.bottom} w-full`}>
          <Showcase slides={slides} className="h-[24vh] w-full" />
        </div>
      </main>

      <footer className="relative mt-[2vh] overflow-hidden border-t border-[#1E3552]/10 bg-white/80 py-[min(2.4vmin,2vh)]">
        <div className="flex w-max animate-[marquee_50s_linear_infinite] items-center gap-[8vmin] px-[4vmin]">
          {ribbon.map((brand, i) =>
            brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${brand.id}-${i}`} src={brand.logoUrl} alt={brand.name} className="h-[min(4.6vmin,4vh)] w-auto max-w-[22vmin] object-contain" />
            ) : (
              <span key={`${brand.id}-${i}`} className="whitespace-nowrap text-[2.4vmin] font-bold tracking-[0.18em] text-[#1E3552]/70">
                {brand.name.toUpperCase()}
              </span>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
