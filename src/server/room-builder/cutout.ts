/**
 * Recorte de fondo para las fotos de producto del Room Builder.
 *
 * Las fotos de fabricante vienen casi siempre sobre blanco. Se borra solo el
 * blanco que toca el borde de la imagen (relleno desde los bordes), así los
 * productos blancos no quedan agujereados: su blanco interior no está
 * conectado al fondo.
 */

/** Umbrales del fondo: casi blanco y casi sin color. */
const MIN_BRIGHT = 232;
const MAX_CHROMA = 20;
/** Pixel ya transparente en la foto original. */
const MAX_ALPHA_BG = 24;

function isBackground(data: Uint8Array, i: number): boolean {
  const r = data[i];
  const g = data[i + 1];
  const b = data[i + 2];
  const a = data[i + 3];
  if (a <= MAX_ALPHA_BG) return true;
  const lo = Math.min(r, g, b);
  const hi = Math.max(r, g, b);
  return lo >= MIN_BRIGHT && hi - lo <= MAX_CHROMA;
}

/**
 * Pone alpha 0 en el fondo conectado a los bordes (RGBA, 4 canales).
 * Devuelve un buffer nuevo y la proporción de píxeles que quedaron visibles.
 */
export function keyOutBackground(
  source: Uint8Array,
  width: number,
  height: number,
): { data: Uint8Array; visibleRatio: number } {
  const data = new Uint8Array(source);
  const total = width * height;
  const seen = new Uint8Array(total);
  const stack: number[] = [];

  const push = (x: number, y: number) => {
    const p = y * width + x;
    if (seen[p]) return;
    seen[p] = 1;
    if (isBackground(data, p * 4)) stack.push(p);
  };

  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }

  let cleared = 0;
  while (stack.length) {
    const p = stack.pop() as number;
    data[p * 4 + 3] = 0;
    cleared++;
    const x = p % width;
    const y = (p - x) / width;
    if (x > 0) push(x - 1, y);
    if (x < width - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < height - 1) push(x, y + 1);
  }

  // Borde suave: el primer píxel del producto pegado al fondo queda a medias.
  for (let p = 0; p < total; p++) {
    if (data[p * 4 + 3] === 0) continue;
    const x = p % width;
    const y = (p - x) / width;
    const touchesBg =
      (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
      (x < width - 1 && data[(p + 1) * 4 + 3] === 0) ||
      (y > 0 && data[(p - width) * 4 + 3] === 0) ||
      (y < height - 1 && data[(p + width) * 4 + 3] === 0);
    if (touchesBg) data[p * 4 + 3] = Math.min(data[p * 4 + 3], 160);
  }

  return { data, visibleRatio: total ? (total - cleared) / total : 0 };
}
