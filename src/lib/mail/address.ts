/**
 * Direcciones de mail: validación y forma canónica. Lo usan las invitaciones
 * de formularios y las campañas (importar listas, deduplicar, bajas).
 */
const EMAIL_RE = /^[^\s@<>()[\],;:"]+@[^\s@<>()[\],;:"]+\.[a-z]{2,}$/i;

export function isEmail(value: string): boolean {
  return EMAIL_RE.test(value.trim());
}

/** Minúsculas y sin espacios: así «Ana@Estudio.com » y «ana@estudio.com» son la misma persona. */
export function normalizeEmail(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

/** Primer mail válido de una celda que puede traer varios («a@x.com; b@y.com»), o null. */
export function firstEmailIn(value: unknown): string | null {
  const parts = String(value ?? "")
    .replace(/[<>]/g, " ")
    .split(/[;,\s/]+/)
    .map(normalizeEmail);
  return parts.find(isEmail) ?? null;
}
