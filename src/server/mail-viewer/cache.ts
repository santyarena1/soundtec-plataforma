/**
 * Caché en memoria del proceso para el visor de correo: LRU con vencimiento por
 * entrada y tope de memoria (aprox. en bytes). En Vercel cada instancia tiene la
 * suya: sirve para no volver a pedirle a IMAP lo mismo, no es fuente de verdad.
 *
 * - Los pedidos simultáneos de la misma clave comparten una sola carga (la página,
 *   el iframe del cuerpo y la precarga no traen tres veces el mismo mensaje).
 * - Un error no se guarda: el próximo pedido vuelve a intentar.
 */

const MAX_BYTES = 64 * 1024 * 1024;
const MAX_ENTRIES = 600;
/** Lo que pesa una entrada chica (listado, carpetas) si no se indica otra cosa. */
const DEFAULT_SIZE = 4 * 1024;

type Entry = { expires: number; value: unknown; size: number };

type Store = { entries: Map<string, Entry>; inflight: Map<string, Promise<unknown>>; bytes: number; generation: number };

// En desarrollo el módulo se recarga con cada cambio: la caché vive en globalThis.
const globalStore = globalThis as unknown as { __mailViewerCache?: Store };
const store: Store = (globalStore.__mailViewerCache ??= { entries: new Map(), inflight: new Map(), bytes: 0, generation: 0 });
store.generation ??= 0;

function drop(key: string): void {
  const hit = store.entries.get(key);
  if (!hit) return;
  store.bytes -= hit.size;
  store.entries.delete(key);
}

function evict(): void {
  const now = Date.now();
  if (store.bytes <= MAX_BYTES && store.entries.size <= MAX_ENTRIES) return;
  for (const [key, entry] of store.entries) if (entry.expires <= now) drop(key);
  // Map conserva el orden de inserción: lo primero es lo menos usado.
  while ((store.bytes > MAX_BYTES || store.entries.size > MAX_ENTRIES) && store.entries.size) drop(store.entries.keys().next().value as string);
}

/** Valor vigente (y lo marca como recién usado), o undefined. */
export function peek<T>(key: string): T | undefined {
  const hit = store.entries.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    drop(key);
    return undefined;
  }
  store.entries.delete(key);
  store.entries.set(key, hit);
  return hit.value as T;
}

export function put<T>(key: string, ttlMs: number, value: T, size = DEFAULT_SIZE): void {
  drop(key);
  if (size > MAX_BYTES / 4) return; // algo tan grande no se guarda
  store.entries.set(key, { expires: Date.now() + ttlMs, value, size });
  store.bytes += size;
  evict();
}

export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>, sizeOf?: (value: T) => number): Promise<T> {
  const hit = peek<T>(key);
  if (hit !== undefined) return hit;
  const running = store.inflight.get(key);
  if (running) return running as Promise<T>;
  // Si en el medio se invalidó algo, lo que llegue puede estar viejo: se devuelve pero no se guarda.
  const generation = store.generation;
  const promise = load()
    .then((value) => {
      if (generation === store.generation) put(key, ttlMs, value, sizeOf ? sizeOf(value) : DEFAULT_SIZE);
      return value;
    })
    .finally(() => {
      if (store.inflight.get(key) === promise) store.inflight.delete(key);
    });
  store.inflight.set(key, promise);
  return promise;
}

/** Borra lo que empiece con ese prefijo (p. ej. después de marcar como leído). */
export function invalidate(prefix: string): void {
  store.generation++;
  for (const key of [...store.inflight.keys()]) if (key.startsWith(prefix)) store.inflight.delete(key);
  for (const key of [...store.entries.keys()]) if (key.startsWith(prefix)) drop(key);
}

/** Para tests y diagnóstico. */
export function cacheStats(): { entries: number; bytes: number; inflight: number } {
  return { entries: store.entries.size, bytes: store.bytes, inflight: store.inflight.size };
}
