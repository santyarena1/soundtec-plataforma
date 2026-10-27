import { prisma } from "@/lib/prisma";
import { LEGACY_QUOTE_AUDIENCES, type QuoteAudienceOption } from "@/lib/quote-audiences";

let legacyChecked = false;

/**
 * Los rubros fijos de antes que ya estaban en uso (en cotizaciones, versiones de
 * textos o tipos de documento) se pasan a la tabla una sola vez, para no romper
 * lo que existe. Los que nadie usa no se crean: la lista arranca vacía.
 */
async function adoptLegacyInUse(): Promise<void> {
  if (legacyChecked) return;
  legacyChecked = true;
  const keys = LEGACY_QUOTE_AUDIENCES.map((a) => a.key as string);
  const [quotes, profiles, variants] = await Promise.all([
    prisma.quote.findMany({ where: { audience: { in: keys } }, distinct: ["audience"], select: { audience: true } }),
    prisma.quoteContentProfile.findMany({ where: { audience: { in: keys } }, distinct: ["audience"], select: { audience: true } }),
    prisma.quoteTextVariant.findMany({ where: { audiences: { hasSome: keys } }, select: { audiences: true } }),
  ]);
  const used = new Set([...quotes.map((q) => q.audience), ...profiles.map((p) => p.audience), ...variants.flatMap((v) => v.audiences)].filter((k): k is string => Boolean(k) && keys.includes(k!)));
  if (!used.size) return;
  await prisma.quoteAudience.createMany({
    data: LEGACY_QUOTE_AUDIENCES.filter((a) => used.has(a.key)).map((a, i) => ({ key: a.key, label: a.label, focus: a.focus, sortOrder: i })),
    skipDuplicates: true,
  });
}

/** Opciones de «A quién va» activas, en el orden elegido. */
export async function listQuoteAudiences(): Promise<QuoteAudienceOption[]> {
  await adoptLegacyInUse();
  const rows = await prisma.quoteAudience.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], select: { key: true, label: true, focus: true } });
  return rows;
}

/** ¿Es una opción de «A quién va» existente (activa)? */
export async function isQuoteAudience(key: string | null | undefined): Promise<boolean> {
  if (!key) return false;
  await adoptLegacyInUse();
  return (await prisma.quoteAudience.count({ where: { key, isActive: true } })) > 0;
}

/** Nombre para mostrar (también de una opción ya archivada). */
export async function audienceLabel(key: string | null | undefined): Promise<string | null> {
  if (!key) return null;
  return (await prisma.quoteAudience.findUnique({ where: { key }, select: { label: true } }))?.label ?? null;
}
