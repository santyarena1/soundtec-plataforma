/**
 * ¿El cambio de reglas fue solo de nombre? Un cambio así no mueve ningún
 * precio, así que se guarda directo (queda registrado igual en Revisión de
 * cambios como aplicado) en vez de esperar una aprobación que nadie va a dar.
 */

/**
 * Campos que pueden cambiar en un «renombre». `priority` entra porque guardar
 * la regla la recalcula sola (reglas viejas tenían otra): solo desempata dentro
 * de un mismo nivel y el motor igual exige que la simulación dé impacto 0.
 */
const NAME_ONLY_FIELDS = new Set(["name", "notes", "updatedAt", "priority"]);

type RuleLike = { id: string } & Record<string, unknown>;

function comparable(value: unknown): string {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object" && "toString" in value && typeof (value as { toString: unknown }).toString === "function") {
    return String(value);
  }
  return String(value);
}

/**
 * true si `after` tiene exactamente las mismas reglas que `before` (mismos
 * ids) y entre ellas solo cambió el nombre o la nota, y además algo cambió.
 */
export function rulesOnlyRenamed(before: readonly RuleLike[], after: readonly RuleLike[]): boolean {
  if (before.length !== after.length) return false;
  const previous = new Map(before.map((rule) => [rule.id, rule]));
  let renamed = false;
  for (const rule of after) {
    const old = previous.get(rule.id);
    if (!old) return false;
    const keys = new Set([...Object.keys(old), ...Object.keys(rule)]);
    for (const key of keys) {
      if (comparable(old[key]) === comparable(rule[key])) continue;
      if (!NAME_ONLY_FIELDS.has(key)) return false;
      if (key === "name") renamed = true;
    }
  }
  return renamed;
}
