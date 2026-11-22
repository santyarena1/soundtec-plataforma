/**
 * Reglas puras de los rubros del árbol de Tango (sin base, con tests):
 * normalizar nombres de subrubros nuevos, detectar duplicados entre hermanos y
 * decidir si se puede crear un subrubro debajo de un nodo.
 */
import { TANGO_MAX_LEVEL, TANGO_SEPARATOR } from "@/lib/tango-tree";

export const RUBRO_NAME_MIN = 2;
export const RUBRO_NAME_MAX = 60;

/**
 * Nombre como lo guarda Tango: MAYÚSCULAS, sin espacios dobles ni en los
 * bordes, con las tildes que haya (no se inventan). «›» y «>» no van porque
 * separan niveles.
 */
export function normalizeRubroName(raw: string): string {
  return raw
    .normalize("NFC")
    .replace(/[>›»]/g, " ")
    .replace(/[\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[-.,;:/]+|[-.,;:]+$/g, "")
    .trim()
    .toLocaleUpperCase("es-AR");
}

/** Clave para comparar hermanos: sin tildes, sin mayúsculas, sin signos ni espacios dobles. */
export function rubroKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLocaleUpperCase("es-AR")
    .replace(/[^A-Z0-9Ñ/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let last = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, last + (a[i - 1] === b[j - 1] ? 0 : 1));
      last = tmp;
    }
  }
  return prev[b.length];
}

/** Hermano muy parecido (no igual): para avisar «¿Quisiste decir…?». */
export function similarSibling(name: string, siblings: string[]): string | null {
  const key = rubroKey(name);
  let best: { name: string; score: number } | null = null;
  for (const sibling of siblings) {
    const other = rubroKey(sibling);
    if (!other || other === key) continue;
    const distance = levenshtein(key, other);
    const score = 1 - distance / Math.max(key.length, other.length);
    const contains = key.length >= 4 && other.length >= 4 && (key.includes(other) || other.includes(key));
    if ((score >= 0.8 || contains) && (!best || score > best.score)) best = { name: sibling, score };
  }
  return best?.name ?? null;
}

export type SubrubroCheck =
  | { ok: true; name: string; path: string; level: number }
  | { ok: false; error: string };

/** ¿Se puede crear «name» debajo de este nodo? Valida nivel, nombre y duplicados. */
export function checkNewSubrubro(
  parent: { tangoPath: string | null; level: number | null; isActive: boolean } | null,
  rawName: string,
  siblings: string[]
): SubrubroCheck {
  if (!parent || !parent.tangoPath) return { ok: false, error: "Solo se pueden crear subrubros debajo de un rubro del árbol de Tango." };
  if (!parent.isActive) return { ok: false, error: "Ese rubro está desactivado." };
  const level = (parent.level ?? parent.tangoPath.split(TANGO_SEPARATOR).length) + 1;
  if (level > TANGO_MAX_LEVEL) return { ok: false, error: `Tango llega hasta ${TANGO_MAX_LEVEL} niveles: elegí un rubro de un nivel más arriba.` };
  const name = normalizeRubroName(rawName);
  if (name.length < RUBRO_NAME_MIN) return { ok: false, error: "Escribí el nombre del subrubro." };
  if (name.length > RUBRO_NAME_MAX) return { ok: false, error: `Máximo ${RUBRO_NAME_MAX} letras.` };
  const key = rubroKey(name);
  const twin = siblings.find((s) => rubroKey(s) === key);
  if (twin) return { ok: false, error: `Ya existe «${twin}» en ese rubro.` };
  return { ok: true, name, path: `${parent.tangoPath}${TANGO_SEPARATOR}${name}`, level };
}

/** «SONIDO > BAFLES PASIVOS» → «SONIDO;BAFLES PASIVOS;;» (formato del CSV de Tango, 4 columnas). */
export function tangoCsvRow(path: string): string {
  const parts = path.split(TANGO_SEPARATOR);
  const cells = Array.from({ length: TANGO_MAX_LEVEL }, (_, i) => parts[i] ?? "");
  return cells.map((c) => `"${c.replace(/"/g, '""')}"`).join(";");
}
