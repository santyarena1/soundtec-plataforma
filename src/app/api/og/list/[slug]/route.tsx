import { prisma } from "@/lib/prisma";
import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";

export const runtime = "nodejs";

/** Tarjeta de una lista de precios compartida: logo de Soundtec y el nombre de la lista (nunca precios). */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[A-Za-z0-9_-]{4,80}$/.test(slug)) return new Response("No encontrado.", { status: 404 });
  try {
    const list = await prisma.shareablePriceList.findUnique({ where: { shareSlug: slug }, select: { name: true, description: true, hidePrices: true } });
    if (!list) return new Response("No encontrado.", { status: 404 });
    const origin = req.url;
    return renderCard(
      {
        kind: "hero",
        eyebrow: list.hidePrices ? "Selección de productos" : "Lista de precios",
        logo: await cardImage(await loadImageBytes(SOUNDTEC_LOGO_PATH, origin), { width: 260, height: 130 }),
        title: list.name,
        subtitle: list.description || "Preparada por el equipo de Soundtec",
      },
      { origin, seed: `list-${slug}` }
    );
  } catch (error) {
    return cardError(error, `list/${slug}`);
  }
}
