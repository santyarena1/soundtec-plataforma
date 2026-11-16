/**
 * Comparación del catálogo contra la lista oficial "Works with Crestron Home".
 *
 * Criterio de variantes (documentado también en src/data/crestron-home-official.json):
 *  - Se normaliza el modelo: mayúsculas, guiones raros → "-", espacios/"_" → "-".
 *  - Se sacan las palabras sueltas ENGRAVED / BLANK / KIT (grabado o kit del mismo equipo).
 *  - Se sacan del FINAL los segmentos de color/terminación/presentación:
 *    -B (negro), -W (blanco), -A (almendra), -G/-GRY (gris), -T (texturado),
 *    -S (liso), -BRZ (bronce), -DSK, -IVR, -LAT, -RED, -BR-BLK, -BR-BRASS,
 *    -DRK-BRZ, -DRK-NKL, -GLASS…, -EACH/-PAIR (unidad o par).
 *    Así TSW-770 ↔ TSW-770-B-S, HZ2-DIMEX ↔ HZ2-DIMEX-GLASS-W ENGRAVED, AIR SR4 ↔ AIR-SR4-W-T.
 *  - Lo que NO es color se respeta: -I (internacional), -NC, -R, -P, -E, -AW, -1G, -C,
 *    -BTN… son otros modelos (HR-310-I ≠ HR-310, TSW-760-NC ≠ TSW-760).
 *  - Además, cuando el link oficial es crestron.com/model/NNNNNNN, coincide el
 *    producto cuyo material number (internalSku) es NNNNNNN.
 */

/** Segmentos finales que solo indican color, terminación o presentación. */
const FINISH_TOKENS = new Set([
  "A", "B", "W", "G", "S", "T",
  "AL", "BB", "BL", "BK", "BLK", "BLACK", "WHITE", "WH",
  "GRY", "GY", "GRAY", "GREY",
  "BRZ", "BR", "BRASS", "DRK", "NKL", "GLASS",
  "DSK", "IVR", "LAT", "RED", "ALM",
  "EACH", "PAIR",
]);

/** Palabras sueltas que no cambian el equipo (botonera grabada, en blanco, kit). */
const LOOSE_WORDS = /\b(ENGRAVED|BLANK|KIT)\b/g;

/** Mínimo de segmentos que deben quedar después de sacar terminaciones. */
const MIN_SEGMENTS = 2;

/** Modelo normalizado sin sacar terminaciones (para comparaciones exactas). */
export function normalizeCrestronModel(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .toUpperCase()
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/\(\d+\)/g, "")
    .replace(/[_\s]+/g, " ")
    .replace(LOOSE_WORDS, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Clave base del modelo: normalizado y sin los segmentos finales de color/terminación. */
export function crestronModelKey(raw: string | null | undefined): string {
  const parts = normalizeCrestronModel(raw).split("-").filter(Boolean);
  while (parts.length > MIN_SEGMENTS && FINISH_TOKENS.has(parts[parts.length - 1])) parts.pop();
  return parts.join("-");
}

/** Slug final de un link /Products/…/SLUG (alias del modelo; la doc a veces escribe distinto el texto). */
export function slugFromProductUrl(url: string): string | null {
  const m = url.match(/crestron\.com\/Products\/.+\/([^/?#]+)\/?(?:[?#].*)?$/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export interface OfficialModelRef {
  model: string;
  categories: string[];
  url: string;
  materialNumber: string | null;
}

export interface CrestronHomeIndex {
  byKey: Map<string, OfficialModelRef>;
  byMaterial: Map<string, OfficialModelRef>;
}

export function buildCrestronHomeIndex(models: readonly OfficialModelRef[]): CrestronHomeIndex {
  const byKey = new Map<string, OfficialModelRef>();
  const byMaterial = new Map<string, OfficialModelRef>();
  for (const m of models) {
    const keys = [crestronModelKey(m.model)];
    const slug = slugFromProductUrl(m.url);
    if (slug) keys.push(crestronModelKey(slug));
    for (const k of keys) if (k && !byKey.has(k)) byKey.set(k, m);
    if (m.materialNumber && !byMaterial.has(m.materialNumber)) byMaterial.set(m.materialNumber, m);
  }
  return { byKey, byMaterial };
}

export interface CatalogProductModel {
  internalSku: string | null;
  modelNumber: string | null;
  manufacturerItem: string | null;
  normalizedName: string;
}

export interface CrestronHomeMatch {
  official: OfficialModelRef;
  /** "material" = mismo material number; "model" = mismo modelo base. */
  by: "material" | "model";
  productKey: string;
}

/** Material number de Crestron que guarda el catálogo (ej. "6511816", a veces con "-" al final). */
function materialOf(sku: string | null): string | null {
  const m = sku?.trim().match(/^(\d{6,8})-?$/);
  return m ? m[1] : null;
}

/**
 * Busca el producto en la lista oficial. Usa el modelo (modelNumber o
 * manufacturerItem); el nombre solo si no hay modelo, porque a veces trae
 * textos como "Limited Supply".
 */
export function matchCrestronHome(product: CatalogProductModel, index: CrestronHomeIndex): CrestronHomeMatch | null {
  const material = materialOf(product.internalSku);
  if (material) {
    const hit = index.byMaterial.get(material);
    if (hit) return { official: hit, by: "material", productKey: material };
  }
  const candidates = [product.modelNumber, product.manufacturerItem].filter((v): v is string => Boolean(v?.trim()));
  if (candidates.length === 0) candidates.push(product.normalizedName);
  for (const c of candidates) {
    const key = crestronModelKey(c);
    const hit = key ? index.byKey.get(key) : undefined;
    if (hit) return { official: hit, by: "model", productKey: key };
  }
  return null;
}
