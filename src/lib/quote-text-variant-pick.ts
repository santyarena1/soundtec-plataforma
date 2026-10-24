/**
 * Qué versión de un texto fijo sale en una cotización (sin base de datos, para testear).
 *
 * Una versión aplica si cumple TODAS sus condiciones (tipo de presupuesto y rubro;
 * una condición vacía = cualquiera). Entre las que aplican gana la más específica
 * (rubro pesa más que tipo). Si ninguna aplica, sale el texto general.
 */
export type TextVariantRule = {
  profiles: string[];
  audiences: string[];
  updatedAt?: Date | string;
};

export type VariantContext = { profileKey: string | null; audience: string | null };

export function variantApplies(variant: TextVariantRule, ctx: VariantContext): boolean {
  if (variant.profiles.length && !(ctx.profileKey && variant.profiles.includes(ctx.profileKey))) return false;
  if (variant.audiences.length && !(ctx.audience && variant.audiences.includes(ctx.audience))) return false;
  // Una versión sin ninguna condición nunca reemplaza sola al texto general.
  return variant.profiles.length > 0 || variant.audiences.length > 0;
}

const specificity = (v: TextVariantRule) => (v.audiences.length ? 2 : 0) + (v.profiles.length ? 1 : 0);

export function pickTextVariant<T extends TextVariantRule>(variants: T[], ctx: VariantContext): T | null {
  const candidates = variants.filter((v) => variantApplies(v, ctx));
  if (!candidates.length) return null;
  return [...candidates].sort((a, b) => {
    const diff = specificity(b) - specificity(a);
    if (diff) return diff;
    // Empate: la que menos casos abarca, y si no, la más reciente.
    const breadth = a.audiences.length + a.profiles.length - (b.audiences.length + b.profiles.length);
    if (breadth) return breadth;
    return new Date(b.updatedAt ?? 0).getTime() - new Date(a.updatedAt ?? 0).getTime();
  })[0]!;
}

/** «Para: Hotelería · Completo» — resumen corto de cuándo se usa. */
export function describeVariantRule(
  v: Pick<TextVariantRule, "profiles" | "audiences">,
  labels: { profile: (k: string) => string; audience: (k: string) => string },
): string {
  const parts = [...v.audiences.map(labels.audience), ...v.profiles.map(labels.profile)];
  return parts.length ? parts.join(" · ") : "Sin condiciones (solo a mano)";
}
