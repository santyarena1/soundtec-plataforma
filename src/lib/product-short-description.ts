import { prisma } from "@/lib/prisma";
import { clipToWords } from "@/lib/quote-product-line";
import { generateShortDescription } from "@/services/openai";
import { hasProductFacts } from "@/lib/quote-ai-items";
import { checkAiDescription } from "@/lib/ai-text-guard";

/** Tope de descripciones que se generan por pedido (cada una es una llamada paga). */
export const SHORT_DESCRIPTION_BATCH_LIMIT = 5;
const SHORT_DESCRIPTION_CONCURRENCY = 3;

/** Resultado de escribir la corta: `noData` = sin ficha o la IA dijo que no tiene datos del modelo. */
export type ShortDescriptionWrite = { text: string | null; noData?: boolean };

export async function fillMissingShortDescription(productId: string): Promise<string | null> {
  return (await writeProductShortDescription(productId, { replace: false })).text;
}

/** Reescribe la descripción corta del producto y la deja guardada en el catálogo. */
export async function regenerateProductShortDescription(productId: string): Promise<ShortDescriptionWrite> {
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
): Promise<ShortDescriptionWrite> {
  const product = await prisma.product.findUnique({
    where: { id: productId },
    include: { brand: true, category: true },
  });
  if (!product) return { text: null };
  const current = product.shortDescription?.trim() || "";
  if (current && !options.replace) return { text: current };

  // Sin ficha ni nombre descriptivo no hay de dónde sacar qué es el equipo: la
  // IA terminaba adivinando por la categoría. Mejor dejarlo vacío.
  if (!hasProductFacts(product)) return { text: null, noData: true };

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
  // Tampoco las negativas de la IA («Lo siento, no hay datos…» o el marcador de sin datos).
  const verdict = checkAiDescription(text);
  if (!verdict.ok || /pendiente|no disponible/i.test(verdict.text)) {
    console.error("[short-description] la IA no devolvió texto utilizable", productId, verdict.ok ? "relleno" : verdict.reason);
    return { text: null, noData: !verdict.ok && verdict.reason === "no_data" };
  }

  const next = clipToWords(verdict.text);
  await prisma.product.update({
    where: { id: product.id },
    // Solo el corto: aiGeneratedDescription es de la descripción LARGA (cartel «Generado con IA» de la ficha).
    data: { shortDescription: next },
  });
  return { text: next };
}

