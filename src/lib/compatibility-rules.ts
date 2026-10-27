import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { expandCategoryIds } from "@/lib/category-tree";
import { tangoPathLabel } from "@/lib/tango-tree";

/**
 * Compatibilidad por grupo: «este producto es compatible con todo Sonido ›
 * Amplificadores», «…solo de Sonance», «…solo de la línea Sonamp». Una regla
 * tiene rubro (con todo lo que cuelga de él), marca y/o línea; lo que no se
 * pone no filtra. Convive con las relaciones de a pares.
 */
export type RuleInput = { categoryId: string | null; brandId: string | null; line: string | null };

/** Productos que entran en una regla (activos, sin el producto mismo). */
export async function ruleWhere(rule: RuleInput, excludeProductId?: string): Promise<Prisma.ProductWhereInput> {
  return {
    isActive: true,
    ...(excludeProductId ? { id: { not: excludeProductId } } : {}),
    ...(rule.categoryId ? { categoryId: { in: await expandCategoryIds([rule.categoryId]) } } : {}),
    ...(rule.brandId ? { brandId: rule.brandId } : {}),
    ...(rule.line ? { line: { equals: rule.line.trim(), mode: "insensitive" } } : {}),
  };
}

/** Todos los productos compatibles por las reglas de un producto (una sola consulta, OR de las reglas). */
export async function productsMatchingRulesWhere(productId: string): Promise<Prisma.ProductWhereInput | null> {
  const rules = await prisma.compatibilityRule.findMany({ where: { productId } });
  if (!rules.length) return null;
  return { OR: await Promise.all(rules.map((r) => ruleWhere(r, productId))) };
}

/**
 * Al revés: productos que tienen una regla en la que entra este producto
 * (ej. el amplificador ve los parlantes que dicen ser compatibles con su rubro).
 */
export async function productsWithRulesCovering(product: { id: string; categoryId: string | null; brandId: string | null; line: string | null }): Promise<string[]> {
  const ancestors: string[] = [];
  if (product.categoryId) {
    const all = await prisma.category.findMany({ select: { id: true, parentId: true } });
    const parent = new Map(all.map((c) => [c.id, c.parentId]));
    for (let id: string | null | undefined = product.categoryId; id; id = parent.get(id)) ancestors.push(id);
  }
  const rules = await prisma.compatibilityRule.findMany({
    where: {
      productId: { not: product.id },
      AND: [
        { OR: [{ categoryId: null }, ...(ancestors.length ? [{ categoryId: { in: ancestors } }] : [])] },
        { OR: [{ brandId: null }, ...(product.brandId ? [{ brandId: product.brandId }] : [])] },
      ],
    },
    select: { productId: true, line: true, categoryId: true, brandId: true },
  });
  const line = product.line?.trim().toLowerCase() ?? null;
  return [
    ...new Set(
      rules
        .filter((r) => (r.categoryId || r.brandId || r.line) && (!r.line || r.line.trim().toLowerCase() === line))
        .map((r) => r.productId),
    ),
  ];
}

/** Texto de una regla: «Sonido › Amplificadores · Sonance · línea Sonamp». */
export function describeRule(rule: { category?: { name: string; tangoPath: string | null } | null; brand?: { name: string } | null; line?: string | null }): string {
  const parts = [
    rule.category ? (rule.category.tangoPath ? tangoPathLabel(rule.category.tangoPath) : rule.category.name) : null,
    rule.brand ? rule.brand.name : null,
    rule.line ? `línea ${rule.line}` : null,
  ].filter(Boolean);
  return parts.join(" · ") || "Cualquier producto";
}
