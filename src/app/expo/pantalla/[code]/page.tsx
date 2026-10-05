import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { getCatalogBrands } from "@/lib/catalog-brands";
import { qrSvgWithLogo } from "@/server/expo/qr-image";
import { getShowcaseProducts } from "@/server/expo/showcase";
import { Showcase, type ShowcaseSlide } from "./showcase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soundtec · Escaneá el QR", robots: { index: false } };

/** AUTO sigue al monitor (CSS orientation); LANDSCAPE/PORTRAIT la fuerzan. */
const LAYOUT = {
  LANDSCAPE: { grid: "grid-cols-[1.25fr_1fr]", text: "text-left", logo: "mx-0", order: "" },
  PORTRAIT: { grid: "grid-cols-1", text: "text-center", logo: "mx-auto", order: "order-first" },
  AUTO: {
    grid: "grid-cols-1 landscape:grid-cols-[1.25fr_1fr]",
    text: "text-center landscape:text-left",
    logo: "mx-auto landscape:mx-0",
    order: "order-first landscape:order-none",
  },
} as const;

const KEYFRAMES = `
@keyframes fadeUp { from { opacity: 0; transform: translateY(1.2vmin); } to { opacity: 1; transform: none; } }
@keyframes marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
`;

/** Pantalla para el televisor del stand. Solo para QR activos. */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const qr = await prisma.expoQr.findFirst({ where: { code, isActive: true }, include: { event: true } });
  if (!qr) notFound();

  const [svg, allBrands, products] = await Promise.all([
    qrSvgWithLogo(`${appUrl()}/e/${code}`),
    getCatalogBrands(),
    getShowcaseProducts(24),
  ]);
  // Merchandising (ropa) no es una marca de equipos: no va en la pantalla.
  const brands = allBrands.filter((b) => !/apparel/i.test(b.name));
  const total = brands.reduce((acc, b) => acc + b.count, 0);
  const logoByBrand = new Map(brands.map((b) => [b.name, b.logoUrl]));
  const slides: ShowcaseSlide[] = products.map((p) => ({ ...p, brandLogo: logoByBrand.get(p.brand) ?? null }));
  const layout = LAYOUT[qr.event.displayOrientation] ?? LAYOUT.AUTO;
  // La cinta de marcas se duplica para que el desplazamiento sea infinito sin saltos.
  const ribbon = [...brands, ...brands];

  return (
    <div className="flex min-h-dvh flex-col overflow-hidden bg-[radial-gradient(ellipse_at_top_left,#ffffff_0%,#eef1f5_60%,#e6eaf0_100%)] text-[#0E1A2B]">
      <style>{KEYFRAMES}</style>

      <main className={`mx-auto grid w-full max-w-[1800px] flex-1 items-center gap-[5vmin] px-[5vmin] pt-[4vmin] ${layout.grid}`}>
        <section className={`space-y-[3vmin] ${layout.text}`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className={`h-[6vmin] w-auto ${layout.logo}`} />
          <h1 className="text-[6.4vmin] font-semibold leading-[1.02] tracking-tight">
            Todo el catálogo,
            <br />
            en tu celular.
          </h1>
          <p className="text-[2.4vmin] text-[#4b5a6b]">
            Más de {total.toLocaleString("es-AR")} productos de audio, video y control de las mejores marcas.
          </p>
          <Showcase slides={slides} />
        </section>

        <section className={`flex flex-col items-center ${layout.order}`}>
          <div className="rounded-[3.5vmin] bg-white p-[3.5vmin] shadow-[0_3vmin_8vmin_rgba(14,26,43,0.16)]">
            <div
              className="w-[min(52vmin,620px)] [&>svg]:h-auto [&>svg]:w-full"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
          <p className="mt-[3vmin] text-[3vmin] font-semibold">Escaneá y explorá</p>
          <p className="mt-[0.8vmin] text-[2vmin] text-[#4b5a6b]">Apuntá la cámara de tu celular al código</p>
          <p className="mt-[2.5vmin] rounded-full bg-[#0E1A2B] px-[2.5vmin] py-[1vmin] text-[1.8vmin] font-medium text-white">
            Pedí tu cuenta y accedé a precios y stock
          </p>
        </section>
      </main>

      <footer className="relative mt-[4vmin] overflow-hidden border-t border-[#0E1A2B]/10 bg-white/70 py-[2.6vmin]">
        <div className="flex w-max animate-[marquee_45s_linear_infinite] items-center gap-[7vmin] px-[3.5vmin]">
          {ribbon.map((brand, i) =>
            brand.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={`${brand.id}-${i}`} src={brand.logoUrl} alt={brand.name} className="h-[5vmin] w-auto max-w-[22vmin] object-contain" />
            ) : (
              <span key={`${brand.id}-${i}`} className="whitespace-nowrap text-[2.6vmin] font-bold tracking-[0.18em] text-[#0E1A2B]/70">
                {brand.name.toUpperCase()}
              </span>
            )
          )}
        </div>
      </footer>
    </div>
  );
}
