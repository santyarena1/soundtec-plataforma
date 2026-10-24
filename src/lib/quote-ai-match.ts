/**
 * Asociación de las sugerencias de la IA («Crestron TSW-770») con un producto
 * del catálogo. Todo lo de acá es puro: la consulta a la base vive en
 * quote-orchestrator y le pasa los candidatos a `pickCatalogMatch`.
 *
 * Criterio de integrador: preferimos dejar la sugerencia como texto antes que
 * asociarla a un equipo equivocado. Nunca se asocia solo por marca ni por una
 * palabra suelta del nombre; el código de modelo tiene que coincidir.
 */

export type MatchCandidate = {
  id: string;
  normalizedName: string;
  originalName?: string | null;
  modelNumber?: string | null;
  internalSku?: string | null;
  supplierSku?: string | null;
  manufacturerItem?: string | null;
  brandName?: string | null;
};

export type MatchResult<T extends MatchCandidate> =
  | { kind: "match"; product: T; score: number; reason: string }
  | { kind: "ambiguous"; options: T[] }
  | { kind: "none" };

/** Minúsculas, sin acentos, sin espacios ni guiones: «TSW 770-B» → «tsw770b». */
export function compactCode(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** Minúsculas con separadores unificados a «-»: «TSW 770/B» → «tsw-770-b». */
function dashed(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Tokens que parecen un código de modelo: tienen al menos un dígito y 3+
 * caracteres alfanuméricos («PM-L1», «ZH403», «UC-BX30-T»). Los números solos
 * cortos («12», «4K») no cuentan.
 */
export function modelTokens(search: string): string[] {
  const out: string[] = [];
  for (const raw of search.split(/[\s,;()/]+/)) {
    const token = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    const compact = compactCode(token);
    if (compact.length < 3) continue;
    if (!/\d/.test(compact)) continue;
    if (/^\d+$/.test(compact) && compact.length < 4) continue;
    if (!out.includes(token)) out.push(token);
  }
  return out;
}

function identifiers(candidate: MatchCandidate): string[] {
  return [candidate.modelNumber, candidate.internalSku, candidate.supplierSku, candidate.manufacturerItem]
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0);
}

function nameTokens(candidate: MatchCandidate): string[] {
  return [candidate.normalizedName, candidate.originalName]
    .filter((v): v is string => typeof v === "string" && v.length > 0)
    .flatMap((name) => name.split(/[\s,;()/|]+/))
    .filter((t) => compactCode(t).length >= 3);
}

/** ¿La marca del producto está nombrada en la búsqueda? */
export function brandMentioned(search: string, brandName: string | null | undefined): boolean {
  const brand = compactCode(brandName);
  if (brand.length < 2) return false;
  const words = search.split(/[\s,;()/]+/).map(compactCode).filter(Boolean);
  if (words.includes(brand)) return true;
  // Marcas de varias palabras («Bose Professional»): todas tienen que estar.
  const parts = (brandName ?? "").split(/\s+/).map(compactCode).filter((p) => p.length >= 2);
  return parts.length > 1 && parts.every((p) => words.includes(p));
}

/** Palabras de la búsqueda que no son la marca ni un código de modelo. */
function looseWords(search: string, brandName: string | null | undefined): string[] {
  const brandParts = new Set(
    (brandName ?? "").split(/\s+/).map(compactCode).filter(Boolean).concat(compactCode(brandName))
  );
  const models = new Set(modelTokens(search).map(compactCode));
  return search
    .split(/[\s,;()/]+/)
    .map(compactCode)
    .filter((w) => w.length >= 2 && !brandParts.has(w) && !models.has(w));
}

/**
 * Puntaje de un candidato para una búsqueda (null = no sirve):
 *  100 — la búsqueda completa (con o sin marca) es el modelo/SKU/nombre exacto
 *   80 — marca nombrada + un código de modelo coincide exacto
 *   70 — sin marca, pero la búsqueda es solo el código y coincide exacto
 *   50 — marca nombrada + el código es el modelo base de una variante
 *        («TSW-770» contra «TSW-770-B-S»)
 * Si la búsqueda nombra otra marca, no hay match aunque el código coincida.
 */
export function scoreCandidate(search: string, candidate: MatchCandidate): { score: number; reason: string } | null {
  const query = compactCode(search);
  if (query.length < 3) return null;
  const ids = identifiers(candidate);
  const withBrand = brandMentioned(search, candidate.brandName);
  const queryNoBrand = withBrand ? compactCode(search.replace(new RegExp(escapeRegExp(candidate.brandName ?? ""), "i"), "")) : query;

  const fullTargets = [...ids, candidate.normalizedName, candidate.originalName ?? ""].map(compactCode).filter(Boolean);
  if (fullTargets.includes(query) || (queryNoBrand.length >= 3 && fullTargets.includes(queryNoBrand))) {
    return { score: 100, reason: "modelo exacto" };
  }
  const tokens = modelTokens(search);
  if (tokens.length === 0) return null;
  const exactPool = new Set([...ids, ...nameTokens(candidate)].map(compactCode));
  const exactToken = tokens.find((t) => exactPool.has(compactCode(t)));
  if (exactToken) {
    if (withBrand) return { score: 80, reason: `marca + modelo ${exactToken}` };
    // Sin marca: solo si la búsqueda no trae otras palabras (podría ser otra marca).
    if (looseWords(search, candidate.brandName).length === 0) return { score: 70, reason: `modelo ${exactToken}` };
    return null;
  }
  if (!withBrand) return null;
  const dashedPool = [...ids, ...nameTokens(candidate)].map(dashed);
  const variantToken = tokens.find((t) => {
    const d = dashed(t);
    return d.length >= 4 && dashedPool.some((id) => id.startsWith(`${d}-`));
  });
  if (variantToken) return { score: 50, reason: `variante de ${variantToken}` };
  return null;
}

/**
 * Elige el producto para una sugerencia. Si el mejor puntaje lo comparten
 * productos distintos (p. ej. dos colores del mismo modelo), devuelve
 * «ambiguous» para que el comercial elija.
 */
export function pickCatalogMatch<T extends MatchCandidate>(search: string, candidates: T[]): MatchResult<T> {
  const scored = candidates
    .map((product) => ({ product, hit: scoreCandidate(search, product) }))
    .filter((row): row is { product: T; hit: { score: number; reason: string } } => row.hit !== null);
  if (scored.length === 0) return { kind: "none" };
  const best = Math.max(...scored.map((row) => row.hit.score));
  const top = scored.filter((row) => row.hit.score === best);
  const unique = top.filter((row, i) => top.findIndex((o) => o.product.id === row.product.id) === i);
  if (unique.length > 1) return { kind: "ambiguous", options: unique.map((row) => row.product) };
  return { kind: "match", product: unique[0].product, score: best, reason: unique[0].hit.reason };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
