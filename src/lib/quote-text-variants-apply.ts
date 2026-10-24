import { prisma } from "@/lib/prisma";
import { listAllBlockVariants, isVariantBlockKey } from "@/lib/quote-block-variants";
import { resolveQuoteModuleBodies } from "@/lib/quote-defaults";
import { pickTextVariant } from "@/lib/quote-text-variant-pick";
import { sanitizeQuoteHtml } from "@/lib/quote-richtext";

/**
 * Pone en cada texto fijo de la cotización la versión que corresponde a su tipo
 * de presupuesto y a quién va. Solo toca lo que sigue «de plantilla»: lo escrito
 * a mano o la versión elegida a mano en esa cotización no se pisa. Las emitidas
 * no se tocan.
 */
export async function applyTextVariantsToQuote(quoteId: string): Promise<{ changed: number }> {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    select: {
      status: true,
      audience: true,
      contentProfile: { select: { key: true } },
      sections: { select: { id: true, type: true, body: true, source: true, variantSlug: true } },
    },
  });
  if (!quote || quote.status === "ISSUED") return { changed: 0 };

  const targets = quote.sections.filter((s) => isVariantBlockKey(s.type) && s.source === "TEMPLATE");
  if (!targets.length) return { changed: 0 };

  const [variants, bodies] = await Promise.all([listAllBlockVariants(), resolveQuoteModuleBodies()]);
  const ctx = { profileKey: quote.contentProfile?.key ?? null, audience: quote.audience ?? null };
  let changed = 0;
  for (const section of targets) {
    const chosen = pickTextVariant(variants[section.type] ?? [], ctx);
    const body = chosen ? sanitizeQuoteHtml(chosen.body) : bodies[section.type] || section.body;
    const slug = chosen?.slug ?? null;
    if (body === section.body && slug === section.variantSlug) continue;
    await prisma.quoteSection.update({ where: { id: section.id }, data: { body, variantSlug: slug } });
    changed += 1;
  }
  return { changed };
}
