import { prisma } from "@/lib/prisma";
import { productSubtitle, productTitle } from "@/lib/product-display";
import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";

export const runtime = "nodejs";

/**
 * Tarjeta de un producto: la foto en un recuadro blanco a la izquierda y, a la
 * derecha, el logo de la marca, el nombre y la descripción corta. Sin precio:
 * el enlace puede llegar a cualquiera.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[A-Za-z0-9_-]{6,60}$/.test(id)) return new Response("No encontrado.", { status: 404 });
  try {
    const product = await prisma.product.findFirst({
      where: { id, isActive: true, OR: [{ brandId: null }, { brand: { hiddenFromCatalog: false } }] },
      select: {
        normalizedName: true,
        modelNumber: true,
        originalName: true,
        shortDescription: true,
        brandId: true,
        brand: { select: { name: true, logoUrl: true } },
        images: { orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }], take: 1, select: { url: true } },
      },
    });
    if (!product) return new Response("No encontrado.", { status: 404 });
    const origin = req.url;
    const [photoBytes, brandBytes, markBytes] = await Promise.all([
      loadImageBytes(product.images[0]?.url, origin),
      // El logo normalizado de la marca (mismo que usa el catálogo).
      product.brandId && product.brand?.logoUrl ? loadImageBytes(`/api/brand-logo/${product.brandId}`, origin) : Promise.resolve(null),
      loadImageBytes(SOUNDTEC_LOGO_PATH, origin),
    ]);
    return renderCard(
      {
        kind: "product",
        photo: (await cardImage(photoBytes, { width: 420, height: 420 })) ?? (await cardImage(markBytes, { width: 260, height: 160 })),
        brandLogo: await cardImage(brandBytes, { width: 300, height: 76 }),
        brandName: product.brand?.name,
        title: productTitle(product),
        subtitle: productSubtitle(product) ?? undefined,
        mark: await cardImage(markBytes, { width: 110, height: 60 }),
      },
      { origin, seed: `product-${id}` }
    );
  } catch (error) {
    return cardError(error, `product/${id}`);
  }
}
