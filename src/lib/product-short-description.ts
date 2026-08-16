import { prisma } from "@/lib/prisma";
import { clipToWords, fallbackShortDescription } from "@/lib/quote-product-line";
import { generateShortDescription } from "@/services/openai";

export async function fillMissingShortDescription(productId: string): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true, category: true },
  });
  if (!product) return null;
  if (product.shortDescription?.trim()) return product.shortDescription.trim();

  let text = "";
  try {
    text = await generateShortDescription({
      name: product.normalizedName,
      brand: product.brand?.name,
      category: product.category?.name,
      compact: true,
    });
  } catch {
    text = "";
  }

  const placeholder = /pendiente|no disponible/i.test(text);
  const next = clipToWords(
    !text || placeholder
      ? fallbackShortDescription({
          name: product.normalizedName,
          brand: product.brand?.name,
          category: product.category?.name,
        })
      : text
  );

  await prisma.product.update({
    where: { id: product.id },
    data: { shortDescription: next },
  });
  return next;
}
