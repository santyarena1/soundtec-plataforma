/**
 * Caché corta en memoria del proceso para no reconectar a IMAP en cada clic
 * (listados 45 s, carpetas 60 s, mensaje abierto 60 s). En Vercel cada
 * instancia tiene la suya: es solo para ahorrar conexiones, no fuente de verdad.
 */

const MAX_ENTRIES = 150;
const store = new Map<string, { expires: number; value: unknown }>();

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key);
  if (hit && hit.expires > now) return hit.value as T;
  const value = await load();
  if (store.size >= MAX_ENTRIES) {
    for (const [k, v] of store) if (v.expires <= now) store.delete(k);
    while (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value as string);
  }
  store.set(key, { expires: now + ttlMs, value });
  return value;
}

/** Borra lo que empiece con ese prefijo (p. ej. después de marcar como leído). */
export function invalidate(prefix: string): void {
  for (const key of store.keys()) if (key.startsWith(prefix)) store.delete(key);
}
