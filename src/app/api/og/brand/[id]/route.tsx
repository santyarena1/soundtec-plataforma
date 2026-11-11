import { getCatalogBrands } from "@/lib/catalog-brands";
import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";

export const runtime = "nodejs";

/** Tarjeta del catálogo filtrado por una marca: su logo grande y cuántos productos tiene. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const brand = (await getCatalogBrands()).find((b) => b.id === id);
    if (!brand) return new Response("No encontrado.", { status: 404 });
    const origin = req.url;
    const bytes = await loadImageBytes(brand.logoUrl || SOUNDTEC_LOGO_PATH, origin);
    return renderCard(
      {
        kind: "hero",
        eyebrow: "Catálogo Soundtec",
        logo: await cardImage(bytes, { width: 620, height: 220 }),
        title: brand.logoUrl ? undefined : brand.name,
        subtitle: brand.count ? `${brand.count.toLocaleString("es-AR")} productos con ficha técnica` : "Consultá disponibilidad",
      },
      { origin, seed: `brand-${id}`, maxAge: 86400 }
    );
  } catch (error) {
    return cardError(error, `brand/${id}`);
  }
}
