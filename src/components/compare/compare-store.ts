"use client";

import { useSyncExternalStore } from "react";
import {
  COMPARE_STORAGE_KEY,
  mergeSelections,
  parseStoredSelection,
  removeFromSelection,
  serializeSelection,
  toggleInSelection,
  type CompareItem,
  type ToggleResult,
} from "@/lib/compare/selection";

/**
 * Selección para comparar, compartida por todas las tarjetas, la barra
 * flotante y la página de comparación. Vive en localStorage: sobrevive a
 * búsquedas, cambios de marca o rubro, recargas y se ve igual en otra pestaña.
 * Si el navegador no deja guardar (modo privado estricto) funciona igual
 * mientras la página siga abierta.
 */

type Listener = () => void;

let items: CompareItem[] = [];
let hydrated = false;
const listeners = new Set<Listener>();
const EMPTY: CompareItem[] = [];

function readStorage(): CompareItem[] {
  try {
    return parseStoredSelection(window.localStorage.getItem(COMPARE_STORAGE_KEY));
  } catch {
    return [];
  }
}

function writeStorage(next: CompareItem[]) {
  try {
    if (next.length) window.localStorage.setItem(COMPARE_STORAGE_KEY, serializeSelection(next));
    else window.localStorage.removeItem(COMPARE_STORAGE_KEY);
  } catch {
    // Sin almacenamiento: la selección queda solo en esta página.
  }
}

function emit() {
  for (const l of listeners) l();
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  // Lo guardado manda; si se tocó algo antes de cargar, se suma detrás.
  items = mergeSelections(readStorage(), items);
  window.addEventListener("storage", (event) => {
    if (event.key !== COMPARE_STORAGE_KEY) return;
    items = parseStoredSelection(event.newValue);
    emit();
  });
}

function set(next: CompareItem[]) {
  items = next;
  writeStorage(next);
  emit();
}

function subscribe(listener: Listener) {
  hydrate();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const compareStore = {
  toggle(item: CompareItem): ToggleResult {
    hydrate();
    const result = toggleInSelection(items, item);
    if (result.status !== "full") set(result.items);
    return result;
  },
  remove(id: string) {
    hydrate();
    set(removeFromSelection(items, id));
  },
  clear() {
    set([]);
  },
  /** La página de comparación fija la selección a lo que se está comparando. */
  replace(next: CompareItem[]) {
    hydrate();
    set(mergeSelections(next, []));
  },
  get(): CompareItem[] {
    hydrate();
    return items;
  },
};

/** Lista actual (vacía en el servidor y en el primer render, para no desfasar la hidratación). */
export function useCompareSelection(): CompareItem[] {
  return useSyncExternalStore(subscribe, () => items, () => EMPTY);
}
