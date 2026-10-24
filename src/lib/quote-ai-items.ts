/**
 * Ficha compacta de un equipo para el prompt: solo datos del catálogo
 * (marca, modelo, descripción, specs y key features). Es lo único con lo que
 * la IA puede describir un equipo; lo que no esté acá no se escribe.
 */

export type ProductFacts = {
  brand?: string | null;
  name: string;
  /** Nombre original del proveedor (suele traer qué es el equipo). */
  originalName?: string | null;
  modelNumber?: string | null;
  category?: string | null;
  shortDescription?: string | null;
  longDescription?: string | null;
  specifications?: unknown;
  keyFeatures?: unknown;
};

const clip = (text: string, max: number) => {
  const t = text.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
};

/** Specs `[{label, labelEs?, value, valueEs?}]` → «Etiqueta: valor». */
export function specLines(raw: unknown, max = 10): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const o = row as Record<string, unknown>;
    const label = String(o.labelEs ?? o.label ?? "").trim();
    const value = String(o.valueEs ?? o.value ?? "").trim();
    if (!label || !value || value === "—" || value === "-") continue;
    out.push(`${clip(label, 50)}: ${clip(value, 110)}`);
    if (out.length >= max) break;
  }
  return out;
}

export function featureLines(raw: unknown, max = 6): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((f) => (typeof f === "string" ? f : f && typeof f === "object" ? String((f as Record<string, unknown>).text ?? "") : ""))
    .map((f) => clip(f, 140))
    .filter(Boolean)
    .slice(0, max);
}

/** Bloque de texto de un equipo. `detail: false` = solo identificación (cotizaciones largas). */
export function productFactsBlock(input: { quantity: number; facts: ProductFacts; detail?: boolean }): string {
  const { facts } = input;
  const title = [facts.brand, facts.name].filter(Boolean).join(" ");
  const head = `- ${input.quantity} × ${title}${facts.modelNumber && !title.includes(facts.modelNumber) ? ` (modelo ${facts.modelNumber})` : ""}`;
  const category = facts.category ? `  Categoría de catálogo (amplia, no define qué es el equipo): ${facts.category}` : "";
  const original =
    facts.originalName && facts.originalName.trim() !== facts.name.trim() ? `  Nombre del proveedor: ${clip(facts.originalName, 200)}` : "";
  if (input.detail === false) {
    const short = facts.shortDescription ? `  Qué es: ${clip(facts.shortDescription, 160)}` : "";
    return [head, original, short].filter(Boolean).join("\n");
  }
  const lines = [head, original, category].filter(Boolean);
  if (facts.shortDescription) lines.push(`  Qué es: ${clip(facts.shortDescription, 200)}`);
  const features = featureLines(facts.keyFeatures);
  if (features.length) lines.push(`  Características: ${features.join(" | ")}`);
  const specs = specLines(facts.specifications);
  if (specs.length) lines.push(`  Specs: ${specs.join(" | ")}`);
  if (!features.length && !specs.length && facts.longDescription) {
    lines.push(`  Ficha: ${clip(facts.longDescription, 500)}`);
  }
  if (!features.length && !specs.length && !facts.longDescription) {
    lines.push("  (sin ficha técnica en catálogo: nombralo por su modelo y por el rol que le da el pedido; no digas qué tipo de equipo es ni le atribuyas capacidades)");
  }
  return lines.join("\n");
}

/** ¿Hay datos reales para describir el producto? (specs, features, ficha o nombre descriptivo). */
export function hasProductFacts(product: {
  normalizedName: string;
  originalName?: string | null;
  specifications?: unknown;
  keyFeatures?: unknown;
  longDescription?: string | null;
}): boolean {
  if (Array.isArray(product.specifications) && product.specifications.length > 0) return true;
  if (Array.isArray(product.keyFeatures) && product.keyFeatures.length > 0) return true;
  if ((product.longDescription ?? "").trim().length >= 40) return true;
  const original = (product.originalName ?? "").trim();
  return original !== product.normalizedName.trim() && original.split(/\s+/).length >= 4;
}
