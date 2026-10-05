"use client";

import { Suspense, useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

/** Dónde se guarda la última vista de cada catálogo (por pestaña del navegador). */
export type CatalogMemoryKey = "portal" | "public" | "admin";

const storageKey = (key: CatalogMemoryKey) => `soundtec:catalog:${key}`;

function readSaved(key: CatalogMemoryKey): string | null {
  try {
    return window.sessionStorage.getItem(storageKey(key));
  } catch {
    return null;
  }
}

function SaveCatalogUrl({ memoryKey }: { memoryKey: CatalogMemoryKey }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  useEffect(() => {
    const query = searchParams.toString();
    try {
      window.sessionStorage.setItem(storageKey(memoryKey), query ? `${pathname}?${query}` : pathname);
    } catch {
      // Sin almacenamiento (modo privado estricto): "Volver" usa el catálogo inicial.
    }
  }, [memoryKey, pathname, searchParams]);
  return null;
}

/** Se monta en la página del catálogo: recuerda la búsqueda, filtros, orden y página actuales. */
export function RememberCatalog({ memoryKey }: { memoryKey: CatalogMemoryKey }) {
  return (
    <Suspense fallback={null}>
      <SaveCatalogUrl memoryKey={memoryKey} />
    </Suspense>
  );
}

/** "Volver al catálogo": vuelve a la última búsqueda guardada; si no hay, al catálogo inicial. */
export function BackToCatalogLink({
  memoryKey,
  fallbackHref,
  className,
  children,
  ...rest
}: {
  memoryKey: CatalogMemoryKey;
  fallbackHref: string;
  className?: string;
  children: ReactNode;
  "data-tour"?: string;
}) {
  const [href, setHref] = useState(fallbackHref);
  useEffect(() => {
    const saved = readSaved(memoryKey);
    // Solo rutas internas del mismo catálogo.
    if (saved && saved.startsWith(fallbackHref.split("?")[0])) setHref(saved);
  }, [memoryKey, fallbackHref]);
  return (
    <Link href={href} className={className} {...rest}>
      {children}
    </Link>
  );
}
