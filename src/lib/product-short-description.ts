import { prisma } from "@/lib/prisma";
import { clipToWords } from "@/lib/quote-product-line";
import { generateShortDescription } from "@/services/openai";
import { hasProductFacts } from "@/lib/quote-ai-items";

/** Tope de descripciones que se generan por pedido (cada una es una llamada paga). */
export const SHORT_DESCRIPTION_BATCH_LIMIT = 5;
const SHORT_DESCRIPTION_CONCURRENCY = 3;

export async function fillMissingShortDescription(productId: string): Promise<string | null> {
  return writeProductShortDescription(productId, { replace: false });
}

/** Reescribe la descripción corta del producto y la deja guardada en el catálogo. */
export async function regenerateProductShortDescription(productId: string): Promise<string | null> {
  return writeProductShortDescription(productId, { replace: true });
}

/**
 * Completa descripciones cortas faltantes de varios productos, con tope y en
 * paralelo acotado. No reintenta ni guarda relleno: si la IA falla, el
 * producto queda sin descripción y la planilla muestra el nombre.
 */
export async function fillMissingShortDescriptions(
  productIds: string[],
  options: { limit?: number } = {}
): Promise<{ filled: number; failed: number; skipped: number; remaining: number }> {
  const limit = options.limit ?? SHORT_DESCRIPTION_BATCH_LIMIT;
  const unique = [...new Set(productIds)];
  if (unique.length === 0) return { filled: 0, failed: 0, skipped: 0, remaining: 0 };
  const missing = await prisma.product.findMany({
    where: { id: { in: unique }, OR: [{ shortDescription: null }, { shortDescription: "" }] },
    select: { id: true, normalizedName: true, originalName: true, specifications: true, keyFeatures: true, longDescription: true },
  });
  // Los que no tienen ficha no se mandan a la IA (no hay de dónde sacar qué son).
  const describable = missing.filter((p) => hasProductFacts(p));
  const skipped = missing.length - describable.length;
  const batch = describable.slice(0, limit).map((p) => p.id);
  let filled = 0;
  let failed = 0;
  for (let i = 0; i < batch.length; i += SHORT_DESCRIPTION_CONCURRENCY) {
    const chunk = batch.slice(i, i + SHORT_DESCRIPTION_CONCURRENCY);
    const results = await Promise.allSettled(chunk.map((id) => fillMissingShortDescription(id)));
    results.forEach((result, index) => {
      if (result.status === "fulfilled" && result.value) {
        filled += 1;
        return;
      }
      failed += 1;
      if (result.status === "rejected") {
        console.error("[short-description] no se pudo completar", chunk[index], result.reason);
      }
    });
  }
  return { filled, failed, skipped, remaining: Math.max(0, describable.length - batch.length) };
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

  // Sin ficha ni nombre descriptivo no hay de dónde sacar qué es el equipo: la
  // IA terminaba adivinando por la categoría. Mejor dejarlo vacío.
  if (!hasProductFacts(product)) return null;

  const text = await generateShortDescription({
    name: product.normalizedName,
    brand: product.brand?.name,
    category: product.category?.name,
    compact: true,
    avoid: options.replace ? current : undefined,
    facts: {
      originalName: product.originalName !== product.normalizedName ? product.originalName : null,
      modelNumber: product.modelNumber,
      specifications: product.specifications,
      keyFeatures: product.keyFeatures,
      longDescription: product.longDescription,
    },
    noFallback: true,
  });

  // Sin texto real no se guarda nada: antes se escribía un relleno genérico
  // («X: solución para Y») que después quedaba en el catálogo como si fuera ficha.
  if (!text || /pendiente|no disponible|\[a confirmar\]/i.test(text)) {
    console.error("[short-description] la IA no devolvió texto utilizable", productId);
    return null;
  }

  const next = clipToWords(text);
  await prisma.product.update({
    where: { id: product.id },
    data: { shortDescription: next, aiGeneratedDescription: true },
  });
  return next;
}

