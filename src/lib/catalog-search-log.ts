/**
 * Registro de búsquedas del catálogo: normalización y reglas anti-ruido.
 * Puro (sin base): lo usa src/server/catalog/search-log.ts y lo prueban los tests.
 */

/** Más largo que esto no es una búsqueda de producto (y no se guarda entero). */
export const SEARCH_QUERY_MAX = 80;
/** La misma búsqueda de la misma persona dentro de esta ventana cuenta una vez. */
export const SEARCH_DEDUPE_MS = 10 * 60_000;
/** Mientras escribe («par», «parl», «parlante»): si la anterior es prefijo y pasó menos de esto, se reemplaza. */
export const SEARCH_TYPING_MERGE_MS = 90_000;
/** Tope por visitante por hora: más que esto es un robot o un script. */
export const SEARCH_MAX_PER_HOUR = 60;

/**
 * Texto de búsqueda normalizado para agrupar: minúsculas, sin acentos, sin
 * signos sueltos ni espacios de más. null si no hay que guardarla: muy corta,
 * un mail, o un número largo (teléfono, CUIT), que no es dato de producto.
 */
export function normalizeSearchQuery(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  if (raw.includes("@")) return null;
  const text = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s\-./+#"]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-./+#"\s]+|[-./+#"\s]+$/g, "");
  if (text.length < 2) return null;
  const digits = text.replace(/\D/g, "");
  // Teléfonos y CUIT: 10 dígitos o más que son casi todo el texto.
  if (digits.length >= 10 && digits.length / text.replace(/\s/g, "").length >= 0.7) return null;
  return text.slice(0, SEARCH_QUERY_MAX).trim();
}

export type LoggedSearch = { query: string; at: Date };

export type SearchLogDecision = "insert" | "skip" | "replace";

/**
 * Qué hacer con una búsqueda nueva frente a la última de la misma persona:
 * - igual y reciente → no se cuenta de nuevo;
 * - una sigue a la otra mientras escribe → se reemplaza la anterior;
 * - si no, se agrega.
 */
export function decideSearchLog(previous: LoggedSearch | null, next: LoggedSearch): SearchLogDecision {
  if (!previous) return "insert";
  const elapsed = next.at.getTime() - previous.at.getTime();
  if (elapsed < 0) return "insert";
  if (previous.query === next.query && elapsed <= SEARCH_DEDUPE_MS) return "skip";
  const typing = next.query.startsWith(previous.query) || previous.query.startsWith(next.query);
  if (typing && elapsed <= SEARCH_TYPING_MERGE_MS) return "replace";
  return "insert";
}
