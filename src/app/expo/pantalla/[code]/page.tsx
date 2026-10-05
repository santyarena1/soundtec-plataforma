import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { prisma } from "@/lib/prisma";
import { getCatalogBrands } from "@/lib/catalog-brands";

export const dynamic = "force-dynamic";
export const metadata = { title: "Soundtec · Escaneá el QR", robots: { index: false } };

function appUrl(): string {
  return (process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.soundtecportal.com.ar").replace(/\/$/, "");
}

/**
 * Pantalla para el televisor del stand. AUTO usa la orientación del monitor
 * (CSS orientation); LANDSCAPE/PORTRAIT la fuerzan.
 */
export default async function Page({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const qr = await prisma.expoQr.findUnique({ where: { code }, include: { event: true } });
  if (!qr) notFound();
  const svg = await QRCode.toString(`${appUrl()}/e/${code}`, { type: "svg", margin: 1, color: { dark: "#0E1A2B", light: "#FFFFFF" } });
  const allBrands = await getCatalogBrands();
  const brands = allBrands.slice(0, 8);
  const total = allBrands.reduce((acc, b) => acc + b.count, 0);
  const forced = qr.event.displayOrientation;
  const layout =
    forced === "LANDSCAPE" ? "grid-cols-[1.1fr_1fr]" : forced === "PORTRAIT" ? "grid-cols-1" : "grid-cols-1 landscape:grid-cols-[1.1fr_1fr]";

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f6f7f9] p-[4vmin] text-[#1d2b3a]">
      <div className={`grid w-full max-w-[1600px] items-center gap-[5vmin] ${layout}`}>
        <div className="text-center landscape:text-left">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/landing/logo_soundtec.png" alt="Soundtec — integramos tecnología" className="mx-auto h-[7vmin] w-auto landscape:mx-0" />
          <h1 className="mt-[4vmin] text-[7vmin] font-semibold leading-[1.05]">Escaneá y explorá<br />todo el catálogo</h1>
          <p className="mt-[2vmin] text-[2.6vmin] text-[#556]">
            Más de {total.toLocaleString("es-AR")} productos de audio, video y control. Pedí tu cuenta y accedé a precios.
          </p>
          <p className="mt-[3vmin] text-[1.8vmin] font-bold tracking-widest text-[#778]">{brands.map((b) => b.name.toUpperCase()).join(" · ")}</p>
        </div>
        <div className="flex flex-col items-center">
          <div className="w-[min(60vmin,640px)] rounded-[3vmin] bg-white p-[3vmin] shadow-xl [&>svg]:h-auto [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />
          <p className="mt-[2vmin] text-[2.4vmin] font-semibold">Apuntá la cámara de tu celular</p>
        </div>
      </div>
    </div>
  );
}
