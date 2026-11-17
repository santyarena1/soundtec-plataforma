/**
 * «Solo rubros de Tango»: el catálogo usa únicamente el árbol de Tango. Lo que
 * no tiene un rubro de Tango claro va a la categoría temporal «Sin categorizar»,
 * que ve solo el equipo (bandeja «Para revisar uno a uno» en Reclasificación).
 *
 * «Sin categorizar» es una categoría raíz SIN tangoPath (no es parte del árbol
 * de Tango, así que no choca con @unique ni aparece en el selector de rubros);
 * se la reconoce por su slug fijo.
 *
 * Este archivo no toca la base: reglas puras, con tests.
 */

export const UNCATEGORIZED_SLUG = "sin-categorizar";
export const UNCATEGORIZED_NAME = "Sin categorizar";

type CategoryLike = { slug?: string | null; name?: string | null; tangoPath?: string | null };

/** ¿Es la categoría temporal «Sin categorizar»? Por slug; si no viene, por nombre. */
export function isUncategorizedCategory(category: CategoryLike | null | undefined): boolean {
  if (!category) return false;
  if (category.slug != null) return category.slug === UNCATEGORIZED_SLUG;
  return (category.name ?? "").trim().toLowerCase() === UNCATEGORIZED_NAME.toLowerCase();
}

/** Nombre del rubro para mostrarle al cliente: nada si es «Sin categorizar». */
export function customerCategoryName(category: CategoryLike | null | undefined): string | null {
  if (!category?.name || isUncategorizedCategory(category)) return null;
  return category.name;
}

/** Un rubro que puede ver el cliente: solo nodos del árbol de Tango (ni viejos ni «Sin categorizar»). */
export function isCustomerTreeNode(category: CategoryLike): boolean {
  return Boolean(category.tangoPath) && !isUncategorizedCategory(category);
}

/**
 * Terminaciones de color/acabado/grabado al final del modelo. Dos modelos que
 * solo difieren en esto son el mismo producto (CBL523-PAS-W y CBL523-PAS-B;
 * HZ2-BTNS-2-DRK-NKL ENGRAVED y HZ2-BTNS-2-B).
 */
const FINISH_TOKENS = new Set([
  "A", "B", "W", "S", "T",
  "BK", "WH", "BL", "BLK", "WHT", "BLACK", "WHITE",
  "DRK", "NKL", "BRZ", "BR", "BRASS", "GLASS",
  "ENGRAVED", "BLANK",
]);

/** Clave del modelo sin las terminaciones de acabado: igual clave = mismo producto en otro color. */
export function modelVariantKey(model: string): string {
  const tokens = model.toUpperCase().trim().split(/[\s-]+/).filter(Boolean);
  while (tokens.length > 1 && FINISH_TOKENS.has(tokens[tokens.length - 1]!)) tokens.pop();
  return tokens.join("-");
}

export type ClassifiedSibling = { brand: string; model: string; tangoPath: string };
export type ManualRule = { brand: string; model: string; tangoPath: string; motivo: string };
export type ProposalInfo = { tangoPath: string; confidence: string; status: string } | null;

export type TangoDecision =
  | { target: "tango"; tangoPath: string; motivo: string }
  | { target: "uncategorized"; tangoPath: null; motivo: string };

const norm = (s: string) => s.trim().toUpperCase();

/**
 * Decide el rubro de un producto que hoy no está en el árbol de Tango. Solo
 * pasa a Tango si es inequívoco; todo lo dudoso va a «Sin categorizar».
 *
 * 1. Propuesta de confianza ALTA (pendiente o aprobada) con un rubro que existe.
 * 2. Regla explícita (data/tango/sin-categorizar-*.json), salvo que choque con la propuesta.
 * 3. El mismo modelo en otro color/acabado ya clasificado: todos sus hermanos en el
 *    mismo rubro y, si hay propuesta, que coincida.
 */
export function decideTangoCategory(input: {
  brand: string | null;
  model: string;
  proposal: ProposalInfo;
  siblings: ClassifiedSibling[];
  manualRules: ManualRule[];
  existingPaths: Set<string>;
}): TangoDecision {
  const { proposal, existingPaths } = input;
  const brand = norm(input.brand ?? "");
  const uncategorized = (motivo: string): TangoDecision => ({ target: "uncategorized", tangoPath: null, motivo });
  const proposalText = proposal ? ` (propuesta ${proposal.confidence}: ${proposal.tangoPath})` : "";

  if (proposal && proposal.confidence === "alta" && proposal.status !== "REJECTED" && existingPaths.has(proposal.tangoPath)) {
    return { target: "tango", tangoPath: proposal.tangoPath, motivo: "Propuesta de confianza alta" };
  }
  const conflicts = (path: string) => Boolean(proposal && proposal.status !== "REJECTED" && proposal.tangoPath !== path);

  const manual = input.manualRules.find((r) => norm(r.brand) === brand && norm(r.model) === norm(input.model));
  if (manual) {
    if (!existingPaths.has(manual.tangoPath)) return uncategorized(`La regla apunta a un rubro que no existe: ${manual.tangoPath}`);
    if (conflicts(manual.tangoPath)) return uncategorized(`La regla (${manual.tangoPath}) no coincide con la propuesta${proposalText}`);
    return { target: "tango", tangoPath: manual.tangoPath, motivo: `Regla: ${manual.motivo}` };
  }

  const key = modelVariantKey(input.model);
  const twins = input.siblings.filter((s) => norm(s.brand) === brand && modelVariantKey(s.model) === key);
  if (twins.length) {
    const paths = [...new Set(twins.map((t) => t.tangoPath))];
    if (paths.length > 1) return uncategorized(`El mismo modelo en otros acabados está en rubros distintos: ${paths.join(" | ")}${proposalText}`);
    const path = paths[0]!;
    if (!existingPaths.has(path)) return uncategorized(`Rubro de los hermanos inexistente: ${path}`);
    if (conflicts(path)) return uncategorized(`Sus hermanos (${twins.map((t) => t.model).join(", ")}) están en ${path}, pero la propuesta dice otra cosa${proposalText}`);
    return { target: "tango", tangoPath: path, motivo: `Mismo modelo en otro acabado ya clasificado: ${twins.map((t) => t.model).slice(0, 3).join(", ")}` };
  }

  return uncategorized(proposal ? `Propuesta con duda${proposalText}` : "Sin propuesta ni modelo hermano clasificado");
}
