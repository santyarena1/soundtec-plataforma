/**
 * Datos de la ficha que se le pasan a la IA para escribir las descripciones,
 * para que no tenga que adivinar (y no conteste «no hay datos» cuando sí los hay).
 * Puro: sin base ni red, se testea solo.
 */
import { tangoPathLabel } from "@/lib/tango-tree";

/** Datos de ficha que se le pasan a la IA. */
export type DescriptionFacts = {
  originalName?: string | null;
  modelNumber?: string | null;
  specifications?: unknown;
  keyFeatures?: unknown;
  longDescription?: string | null;
  /** Serie del fabricante. */
  series?: string | null;
  /** Ruta de categoría del fabricante («Control > Processors»). */
  sourceCategoryPath?: string | null;
  /** HTML oficial del fabricante (se pasa como texto, recortado). */
  officialHtml?: string | null;
};

type Limits = { features: number; specs: number; longChars: number; htmlChars: number };
const SHORT_LIMITS: Limits = { features: 6, specs: 10, longChars: 600, htmlChars: 0 };
const LONG_LIMITS: Limits = { features: 12, specs: 25, longChars: 0, htmlChars: 2500 };

export function htmlToPlainText(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function featureLines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((f): f is string => typeof f === "string" && f.trim().length > 0)
    .slice(0, max)
    .map((f) => f.trim().slice(0, 160));
}

function specLines(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!row || typeof row !== "object") return "";
      const o = row as Record<string, unknown>;
      const label = String(o.labelEs ?? o.label ?? o.name ?? "").trim();
      const value = String(o.valueEs ?? o.value ?? "").trim();
      return label && value ? `${label.slice(0, 60)}: ${value.slice(0, 120)}` : "";
    })
    .filter(Boolean)
    .slice(0, max);
}

function factLines(facts: DescriptionFacts, limits: Limits): string[] {
  const lines: string[] = [];
  if (facts.originalName) lines.push(`Nombre del proveedor: ${facts.originalName.slice(0, 200)}`);
  if (facts.modelNumber) lines.push(`Modelo: ${facts.modelNumber}`);
  if (facts.series) lines.push(`Serie: ${facts.series}`);
  if (facts.sourceCategoryPath) lines.push(`Categoría del fabricante: ${facts.sourceCategoryPath.slice(0, 200)}`);
  const kf = featureLines(facts.keyFeatures, limits.features);
  if (kf.length) lines.push(`Características: ${kf.join(" | ")}`);
  const specs = specLines(facts.specifications, limits.specs);
  if (specs.length) lines.push(`Especificaciones: ${specs.join(" | ")}`);
  if (limits.longChars && facts.longDescription?.trim()) {
    lines.push(`Ficha: ${facts.longDescription.replace(/\s+/g, " ").trim().slice(0, limits.longChars)}`);
  }
  if (limits.htmlChars) {
    const official = htmlToPlainText(facts.officialHtml).slice(0, limits.htmlChars);
    if (official) lines.push(`Extracto de la ficha oficial del fabricante: ${official}`);
  }
  return lines;
}

/** Datos para la descripción corta (compacto). */
export function shortFactsForPrompt(facts: DescriptionFacts): string {
  return factLines(facts, SHORT_LIMITS).join("\n");
}

/** Datos para la descripción larga: specs, características, serie y extracto del HTML oficial. */
export function longFactsForPrompt(facts: DescriptionFacts): string {
  return factLines(facts, LONG_LIMITS).join("\n");
}

/** Producto tal como lo leen las acciones (con marca, rubro y serie). */
export type ProductForDescription = {
  normalizedName: string;
  originalName?: string | null;
  modelNumber?: string | null;
  shortDescription?: string | null;
  specifications?: unknown;
  keyFeatures?: unknown;
  htmlContent?: string | null;
  sourceCategoryPath?: string | null;
  productLine?: string | null;
  brand?: { name: string } | null;
  category?: { name: string; tangoPath?: string | null } | null;
  series?: { name: string } | null;
};

export type LongDescriptionInput = {
  name: string;
  brand?: string;
  category?: string;
  short?: string;
  facts?: DescriptionFacts;
};

/** Rubro completo («Sonido › Bafles pasivos › Embutir») o el nombre de la categoría. */
export function categoryLabel(category: ProductForDescription["category"]): string | undefined {
  if (!category) return undefined;
  return category.tangoPath ? tangoPathLabel(category.tangoPath) : category.name;
}

/** Arma lo que se le pasa al generador de la descripción larga. `overrides` = lo escrito y no guardado (edición rápida). */
export function longDescriptionInput(p: ProductForDescription, overrides: { name?: string; short?: string } = {}): LongDescriptionInput {
  const short = (overrides.short ?? p.shortDescription ?? "").trim();
  return {
    name: overrides.name?.trim() || p.normalizedName,
    brand: p.brand?.name,
    category: categoryLabel(p.category),
    short: short || undefined,
    facts: {
      originalName: p.originalName && p.originalName !== p.normalizedName ? p.originalName : null,
      modelNumber: p.modelNumber,
      series: p.series?.name || p.productLine || null,
      sourceCategoryPath: p.sourceCategoryPath,
      specifications: p.specifications,
      keyFeatures: p.keyFeatures,
      officialHtml: p.htmlContent,
    },
  };
}

/** Include de Prisma con lo que necesita longDescriptionInput. */
export const DESCRIPTION_PRODUCT_INCLUDE = {
  brand: { select: { name: true } },
  category: { select: { name: true, tangoPath: true } },
  series: { select: { name: true } },
} as const;
