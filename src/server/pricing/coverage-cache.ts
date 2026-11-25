/**
 * Caché corta del cálculo de «Por producto» (Márgenes/Descuentos). Para contar
 * «con regla / sin regla» hay que calcular el precio de todo el catálogo; al
 * filtrar, pasar de página o abrir un producto se reutiliza ese cálculo (uno por
 * cliente elegido en «Ver como») en vez de repetirlo. Se vacía al aplicar un
 * cambio de precios en este servidor y, por las dudas (otros servidores, costos
 * sincronizados), vence sola al minuto.
 */
const TTL_MS = 60_000;
const MAX_ENTRIES = 16;

type Entry<T> = { at: number; value: Promise<T> };
const entries = new Map<string, Entry<unknown>>();

export function cachedCoverage<T>(key: string, compute: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const hit = entries.get(key) as Entry<T> | undefined;
  if (hit && now - hit.at < TTL_MS) return hit.value;
  const value = compute();
  entries.set(key, { at: now, value });
  // Si falla, no queda guardado el error.
  value.catch(() => {
    if (entries.get(key)?.value === value) entries.delete(key);
  });
  while (entries.size > MAX_ENTRIES) {
    const oldest = entries.keys().next().value;
    if (oldest === undefined) break;
    entries.delete(oldest);
  }
  return value;
}

/** Después de aplicar reglas, rubros, descuentos o redondeo: lo próximo se calcula de nuevo. */
export function invalidateCoverageCache(): void {
  entries.clear();
}
