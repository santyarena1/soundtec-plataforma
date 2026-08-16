import { prisma } from "@/lib/prisma";
import { clipToWords, fallbackShortDescription } from "@/lib/quote-product-line";
import { generateShortDescription } from "@/services/openai";

export async function fillMissingShortDescription(productId: string): Promise<string | null> {
  return writeProductShortDescription(productId, { replace: false });
}

/** Reescribe la descripción corta del producto y la deja guardada en el catálogo. */
export async function regenerateProductShortDescription(productId: string): Promise<string | null> {
  return writeProductShortDescription(productId, { replace: true });
}

async function writeProductShortDescription(
  productId: string,
  options: { replace: boolean }
): Promise<string | null> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true, category: true },
  });
  if (!product) return null;
  const current = product.shortDescription?.trim() || "";
  if (current && !options.replace) return current;

  let text = "";
  try {
    text = await generateShortDescription({
      name: product.normalizedName,
      brand: product.brand?.name,
      category: product.category?.name,
      compact: true,
      avoid: options.replace ? current : undefined,
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
