/**
 * Selección de productos para comparar (2 a 4). Se guarda en el navegador y se
 * mantiene aunque se busque otra cosa, se cambie de marca o rubro o se navegue:
 * cada producto guarda lo mínimo para la barra flotante (nombre, marca, foto).
 * Sin React ni almacenamiento: funciones puras para poder probarlas.
 */

export const COMPARE_MIN = 2;
export const COMPARE_MAX = 4;
export const COMPARE_STORAGE_KEY = "soundtec:compare:v1";

export interface CompareItem {
  id: string;
  name: string;
  brand: string | null;
  image: string | null;
}

export type ToggleResult = { items: CompareItem[]; status: "added" | "removed" | "full" };

const ID = /^[A-Za-z0-9_-]{1,64}$/;

function cleanItem(raw: unknown): CompareItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== "string" || !ID.test(r.id)) return null;
  const text = (v: unknown, max: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
  return { id: r.id, name: text(r.name, 160) ?? r.id, brand: text(r.brand, 80), image: text(r.image, 1000) };
}

/** Une dos selecciones: primero la principal, sin repetir y con tope de 4. */
export function mergeSelections(primary: CompareItem[], secondary: CompareItem[], max = COMPARE_MAX): CompareItem[] {
  const seen = new Set<string>();
  const out: CompareItem[] = [];
  for (const item of [...primary, ...secondary]) {
    if (seen.has(item.id) || out.length >= max) continue;
    seen.add(item.id);
    out.push(item);
  }
  return out;
}

/** Lo guardado (puede venir roto, de otra versión o tocado a mano) → lista válida. */
export function parseStoredSelection(raw: string | null | undefined): CompareItem[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    const list = Array.isArray(data) ? data : data && typeof data === "object" ? (data as { items?: unknown }).items : null;
    if (!Array.isArray(list)) return [];
    return mergeSelections(list.map(cleanItem).filter((i): i is CompareItem => !!i), []);
  } catch {
    return [];
  }
}

export function serializeSelection(items: CompareItem[]): string {
  return JSON.stringify({ v: 1, items: mergeSelections(items, []) });
}

/** Marca o desmarca. Con 4 elegidos no suma (avisa «full») y no saca ninguno solo. */
export function toggleInSelection(items: CompareItem[], item: CompareItem): ToggleResult {
  if (items.some((i) => i.id === item.id)) return { items: items.filter((i) => i.id !== item.id), status: "removed" };
  if (items.length >= COMPARE_MAX) return { items, status: "full" };
  return { items: [...items, item], status: "added" };
}

export function removeFromSelection(items: CompareItem[], id: string): CompareItem[] {
  return items.filter((i) => i.id !== id);
}

/** ?ids=a,b,c → ids válidos, sin repetir, hasta 4. */
export function parseCompareIds(value: string | string[] | undefined): string[] {
  const raw = Array.isArray(value) ? value.join(",") : value ?? "";
  return [...new Set(raw.split(",").map((s) => s.trim()).filter((s) => ID.test(s)))].slice(0, COMPARE_MAX);
}

export function compareHref(basePath: string, items: Array<Pick<CompareItem, "id">>): string {
  return items.length ? `${basePath}?ids=${items.map((i) => i.id).join(",")}` : basePath;
}
