/**
 * IA de producto → rubro de Tango (puro, con tests). La IA elige una RUTA del
 * árbol activo («SONIDO > BAFLES PASIVOS > BAFLES EXTERIOR») y acá se valida
 * contra el árbol: solo vale si coincide exacto (sin importar mayúsculas,
 * espacios o el separador). Nunca se crean rubros ni se aproxima por parecido.
 */

const SEPARATORS = /\s*(?:>|›|»)\s*/;

/** «Sonido › bafles  pasivos» → «SONIDO > BAFLES PASIVOS». Vacío si no hay texto. */
export function normalizeRubroPath(raw: string | null | undefined): string {
  if (!raw) return "";
  return raw
    .split(SEPARATORS)
    .map((part) => part.replace(/\s+/g, " ").trim().toLocaleUpperCase("es-AR"))
    .filter(Boolean)
    .join(" > ");
}

/** La ruta del árbol que coincide exacto con la respuesta, o null. */
export function matchRubroPath(answer: string | null | undefined, paths: readonly string[]): string | null {
  const key = normalizeRubroPath(answer);
  if (!key) return null;
  return paths.find((path) => normalizeRubroPath(path) === key) ?? null;
}

/** Rutas de nivel 2 («RUBRO > SUBRUBRO»), únicas y ordenadas: primer paso de la IA. */
export function secondLevelPaths(paths: readonly string[]): string[] {
  const out = new Set<string>();
  for (const path of paths) {
    const parts = path.split(" > ");
    if (parts.length >= 2) out.add(parts.slice(0, 2).join(" > "));
  }
  return [...out].sort((a, b) => a.localeCompare(b, "es"));
}

/** La rama y todo lo que cuelga de ella: segundo paso de la IA. */
export function pathsUnder(branch: string, paths: readonly string[]): string[] {
  return paths.filter((path) => path === branch || path.startsWith(`${branch} > `)).sort((a, b) => a.localeCompare(b, "es"));
}

/** Varias equivalencias para la misma ruta: vale solo si todas apuntan al mismo rubro. */
export function consistentCategoryId(hits: ReadonlyArray<string | null | undefined>): string | null {
  const ids = new Set(hits.filter((id): id is string => !!id));
  return ids.size === 1 ? [...ids][0] : null;
}

/** Reglas del dueño para que la IA no traduzca literal ni invente. */
export const RUBRO_AI_RULES = [
  "Elegí UNA ruta copiada tal cual de la lista. No inventes rutas, no las traduzcas ni las acortes.",
  "Si ninguna encaja con seguridad, respondé path null: es mejor dejarlo en Sin categorizar que adivinar.",
  "No elijas por parecido de palabras del proveedor: decidí por qué es el producto.",
  "Vocabulario AV argentino: rejilla (grille), parlante o bafle (speaker), caja de empotrar (back box), plataforma de embutir (rough-in / bracket), pantalla táctil (touch panel), placa (wall plate), colgante (pendant), barra de sonido (soundbar). «Keypad» queda en inglés.",
].join("\n");

export interface RubroPromptInput {
  productName: string;
  sku?: string | null;
  brand?: string | null;
  shortDescription?: string | null;
  sourceCategoryPath?: string | null;
}

/** Texto del producto para el prompt (solo los datos que hay). */
export function describeProductForRubro(input: RubroPromptInput): string {
  return [
    `Producto: ${input.productName}`,
    input.sku ? `SKU: ${input.sku}` : "",
    input.brand ? `Marca: ${input.brand}` : "",
    input.shortDescription ? `Descripción: ${input.shortDescription.slice(0, 600)}` : "",
    input.sourceCategoryPath ? `Categoría del proveedor (solo referencia): ${input.sourceCategoryPath}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
