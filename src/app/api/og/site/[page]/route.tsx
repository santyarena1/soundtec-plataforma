import { getCatalogBrands, totalProducts } from "@/lib/catalog-brands";
import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";
import { brandStrip } from "@/lib/og/brand-strip";
import type { SiteCardPage } from "@/lib/og/meta";

export const runtime = "nodejs";

const PAGES: Record<SiteCardPage, { eyebrow?: string; title: string; subtitle?: string }> = {
  home: { title: "Soluciones audiovisuales profesionales", subtitle: "Audio, video, control y automatización para proyectos integrados" },
  catalogo: { eyebrow: "Catálogo", title: "Todas nuestras marcas en un solo lugar" },
  portal: { eyebrow: "Portal de clientes", title: "Precios, pedidos y cotizaciones", subtitle: "Ingresá con tu cuenta de Soundtec" },
  expo: { eyebrow: "Soundtec en la expo", title: "Conocé nuestras marcas" },
  consultar: { eyebrow: "Consultas", title: "Contanos qué necesitás" },
  solicitar: { eyebrow: "Cuenta de cliente", title: "Pedí tu cuenta en Soundtec", subtitle: "Precios de distribuidor, pedidos y cotizaciones en un solo lugar" },
};

/** Tarjeta general: logo de Soundtec, el título de la sección y la fila de marcas. */
export async function GET(req: Request, { params }: { params: Promise<{ page: string }> }) {
  const { page } = await params;
  const content = PAGES[page as SiteCardPage] ?? PAGES.home;
  try {
    const origin = req.url;
    const [logoBytes, strip, total] = await Promise.all([
      loadImageBytes(SOUNDTEC_LOGO_PATH, origin),
      brandStrip(origin),
      page === "catalogo" ? getCatalogBrands().then(totalProducts).catch(() => 0) : Promise.resolve(0),
    ]);
    return renderCard(
      {
        kind: "hero",
        eyebrow: content.eyebrow,
        logo: await cardImage(logoBytes, { width: 300, height: 150 }),
        title: content.title,
        subtitle: page === "catalogo" && total ? `${total.toLocaleString("es-AR")} productos con ficha técnica` : content.subtitle,
        strip,
      },
      { origin, seed: `site-${page}`, maxAge: 86400 }
    );
  } catch (error) {
    return cardError(error, `site/${page}`);
  }
}
