/**
 * Equivalencias «categoría o ruta del proveedor → rubro de Tango» (puro, con
 * tests). Las usan las sincronizaciones, los importadores y la IA de producto
 * para ubicar productos nuevos sin adivinar por parecido de palabras: si no
 * hay equivalencia, el producto va a «Sin categorizar».
 */

/** Fuentes conocidas. «*» = vale para cualquier fuente (las derivadas de productos ya ubicados). */
export const EQUIVALENCE_SOURCES = ["*", "sonance", "crestron", "soundtube", "hall", "excel", "ai", "sync"] as const;
export type EquivalenceSource = (typeof EQUIVALENCE_SOURCES)[number];

export const EQUIVALENCE_SOURCE_LABEL: Record<string, string> = {
  "*": "Cualquier fuente",
  sonance: "Portal Sonance",
  crestron: "Crestron (sitio)",
  soundtube: "Lista SoundTube",
  hall: "Hall Research",
  excel: "Importar Excel",
  ai: "IA de producto",
  sync: "Sincronizaciones",
};

/**
 * Clave de una ruta del proveedor: minúsculas, sin tildes, separadores
 * unificados en « > » («Accessories / Parts» y «accessories > parts» son la
 * misma). Vacío si no hay texto.
 */
export function equivalenceKey(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+\/\s*|\s*\/\s+/g, " > ")
    .split(/[>›»|\\]/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" > ");
}

export interface EquivalenceCandidate {
  brandKey: string;
  sourceKey: string;
  sourceLabel: string;
  categoryId: string;
  sampleCount: number;
  sampleShare: number;
}

/** Rutas que no dicen qué es el producto: discontinuados, «inactivos» o solo el nombre de la marca. */
const UNINFORMATIVE = /\b(inactive|discontinued|discontinuado|obsolete|legacy|eol)\b/;

export function isInformativeSourceKey(sourceKey: string, brandName?: string | null): boolean {
  if (!sourceKey || UNINFORMATIVE.test(sourceKey)) return false;
  const brand = equivalenceKey(brandName);
  if (brand && (sourceKey === brand || sourceKey.replace(/[^a-z0-9]/g, "") === brand.replace(/[^a-z0-9]/g, ""))) return false;
  return true;
}

/**
 * Equivalencias seguras a partir de productos ya ubicados: misma ruta de
 * proveedor (y misma marca) → mismo rubro en al menos `minShare` de los casos
 * y con al menos `minCount` productos. Lo demás no se sugiere.
 */
export function deriveEquivalences(
  rows: Array<{ brandKey: string; brandName?: string | null; sourcePath: string | null; categoryId: string | null }>,
  options: { minShare?: number; minCount?: number } = {}
): EquivalenceCandidate[] {
  const minShare = options.minShare ?? 0.9;
  const minCount = options.minCount ?? 3;
  const groups = new Map<string, { brandKey: string; sourceKey: string; label: string; total: number; byCategory: Map<string, number> }>();
  for (const row of rows) {
    const sourceKey = equivalenceKey(row.sourcePath);
    if (!sourceKey || !row.categoryId || !isInformativeSourceKey(sourceKey, row.brandName)) continue;
    const id = `${row.brandKey}::${sourceKey}`;
    const group = groups.get(id) ?? { brandKey: row.brandKey, sourceKey, label: row.sourcePath!.trim(), total: 0, byCategory: new Map() };
    group.total += 1;
    group.byCategory.set(row.categoryId, (group.byCategory.get(row.categoryId) ?? 0) + 1);
    groups.set(id, group);
  }
  const out: EquivalenceCandidate[] = [];
  for (const group of groups.values()) {
    let best: [string, number] | null = null;
    for (const entry of group.byCategory) if (!best || entry[1] > best[1]) best = entry;
    if (!best) continue;
    const share = best[1] / group.total;
    if (best[1] >= minCount && share >= minShare) {
      out.push({
        brandKey: group.brandKey,
        sourceKey: group.sourceKey,
        sourceLabel: group.label,
        categoryId: best[0],
        sampleCount: best[1],
        sampleShare: Math.round(share * 1000) / 1000,
      });
    }
  }
  return out.sort((a, b) => b.sampleCount - a.sampleCount);
}

/**
 * Orden de búsqueda: la más específica primero (fuente + marca, fuente sola,
 * cualquier fuente + marca, cualquier fuente).
 */
export function equivalenceLookupOrder(source: string, brandKey: string): Array<{ source: string; brandKey: string }> {
  const list = [
    { source, brandKey },
    { source, brandKey: "" },
    { source: "*", brandKey },
    { source: "*", brandKey: "" },
  ];
  const seen = new Set<string>();
  return list.filter((item) => {
    const key = `${item.source}|${item.brandKey}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
