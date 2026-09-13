import { prisma } from "@/lib/prisma";
import { ExpoExperience } from "@/components/expo/expo-experience";
import type { ChatProduct } from "@/components/expo/types";

export const dynamic = "force-dynamic";

/**
 * `/expo?product=<id|slug>` es el destino de los QR de producto: arranca la
 * conversación con ese producto como contexto.
 */
async function resolveInitialProduct(raw: string | undefined): Promise<ChatProduct | null> {
  const value = (raw ?? "").trim();
  if (!value || value.length > 120) return null;
  try {
    const product = await prisma.product.findFirst({
      where: {
        isActive: true,
        OR: [
          { id: value },
          { urlSlug: value },
          { internalSku: { equals: value, mode: "insensitive" } },
          { modelNumber: { equals: value, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        normalizedName: true,
        originalName: true,
        brand: { select: { name: true } },
        images: {
          select: { url: true },
          orderBy: [{ isPrimary: "desc" }, { createdAt: "asc" }],
          take: 1,
        },
      },
    });
    if (!product) return null;
    return {
      id: product.id,
      name: product.normalizedName || product.originalName,
      brandName: product.brand?.name ?? null,
      imageUrl: product.images[0]?.url ?? null,
      href: `/catalogo/${product.id}`,
    };
  } catch {
    return null;
  }
}

export default async function ExpoPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = Array.isArray(params.product) ? params.product[0] : params.product;
  const initialProduct = await resolveInitialProduct(raw);
  return <ExpoExperience initialProduct={initialProduct} />;
}
