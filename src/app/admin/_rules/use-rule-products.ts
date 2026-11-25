"use client";

import { useEffect, useState } from "react";
import { listRuleCategoryTree, listRuleProductOptions } from "@/server/actions/pricing-rules";
import type { CategoryNode } from "@/lib/category-tree";

export type RuleProductOption = { id: string; normalizedName: string };

/**
 * Lista pesada que se pide una sola vez por pestaña del navegador y recién cuando
 * hace falta (antes viajaba entera con cada carga de Márgenes/Descuentos).
 */
function lazyList<T>(load: () => Promise<T[]>) {
  let shared: Promise<T[]> | null = null;
  const once = () => {
    if (!shared) {
      shared = load().catch((err: unknown) => {
        shared = null;
        throw err;
      });
    }
    return shared;
  };
  return function useLazyList(enabled: boolean): { list: T[] | null; loading: boolean; error: boolean } {
    const [list, setList] = useState<T[] | null>(null);
    const [error, setError] = useState(false);
    useEffect(() => {
      if (!enabled || list) return;
      let cancelled = false;
      setError(false);
      once()
        .then((rows) => {
          if (!cancelled) setList(rows);
        })
        .catch(() => {
          if (!cancelled) setError(true);
        });
      return () => {
        cancelled = true;
      };
    }, [enabled, list]);
    return { list, loading: enabled && !list && !error, error };
  };
}

const useProductList = lazyList(listRuleProductOptions);
const useCategoryList = lazyList(listRuleCategoryTree);

/**
 * Productos para el alcance «Producto(s)», pedidos al elegirlo. Mientras llegan
 * se usa `fallback` (los productos de las reglas que trajo la pantalla).
 */
export function useRuleProducts(enabled: boolean, fallback: RuleProductOption[]) {
  const { list, loading, error } = useProductList(enabled);
  return { products: list ?? fallback, loading, error };
}

/**
 * Árbol de rubros para elegir. Si la pantalla ya lo trajo (`initial` con nodos)
 * se usa ese; si no, se pide cuando hace falta.
 */
export function useRuleCategories(enabled: boolean, initial: CategoryNode[]) {
  const { list, loading, error } = useCategoryList(enabled && initial.length === 0);
  return { categories: initial.length ? initial : list ?? [], loading, error };
}
