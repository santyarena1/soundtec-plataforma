/**
 * Color de texto legible sobre el color de una etiqueta (Admin → Etiquetas).
 * Cada etiqueta tiene su color elegido a mano: el texto va blanco o casi negro
 * según el contraste WCAG con ese fondo. Color inválido → el gris del sistema.
 */

const DARK_TEXT = "#111827";
const LIGHT_TEXT = "#ffffff";
export const FALLBACK_LABEL_COLOR = "#475569";

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** «#abc» o «#aabbcc» → «#aabbcc»; cualquier otra cosa → null. */
export function normalizeHexColor(value: string | null | undefined): string | null {
  const raw = (value ?? "").trim();
  if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(raw)) return `#${raw[1]}${raw[1]}${raw[2]}${raw[2]}${raw[3]}${raw[3]}`.toLowerCase();
  return null;
}

/** Fondo y texto para pintar una etiqueta. */
export function labelColors(color: string | null | undefined): { background: string; color: string } {
  const background = normalizeHexColor(color) ?? FALLBACK_LABEL_COLOR;
  const lum = luminance(background);
  const contrastWithWhite = 1.05 / (lum + 0.05);
  const contrastWithDark = (lum + 0.05) / (luminance(DARK_TEXT) + 0.05);
  return { background, color: contrastWithWhite >= contrastWithDark ? LIGHT_TEXT : DARK_TEXT };
}
