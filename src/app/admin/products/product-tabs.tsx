"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { REVEAL_PRODUCT_TAB_EVENT } from "@/lib/product-tab-events";

/**
 * Solapas de la ficha admin de producto. Los paneles quedan montados (solo se
 * ocultan): el formulario sigue siendo uno y el botón «Guardar» guarda todo,
 * aunque lo editado esté en otra solapa. La solapa activa va en la URL
 * (?solapa=precio) para poder compartirla o volver con «atrás».
 */

export const PRODUCT_TABS = [
  { key: "general", label: "General" },
  { key: "precio", label: "Precio y costos" },
  { key: "comex", label: "Comercio exterior" },
  { key: "contenido", label: "Contenido" },
  { key: "imagenes", label: "Imágenes" },
  { key: "relaciones", label: "Relaciones" },
  { key: "proveedor", label: "Proveedor" },
] as const;

export type ProductTabKey = (typeof PRODUCT_TABS)[number]["key"];

const isTab = (value: string | null): value is ProductTabKey => PRODUCT_TABS.some((t) => t.key === value);

type Ctx = { active: ProductTabKey; setActive: (tab: ProductTabKey) => void; dirty: boolean; setDirty: (v: boolean) => void };
const TabsContext = createContext<Ctx | null>(null);

export function ProductTabsProvider({ children, counts }: { children: React.ReactNode; counts?: Partial<Record<ProductTabKey, number>> }) {
  const [active, setActiveState] = useState<ProductTabKey>("general");
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get("solapa");
    if (isTab(fromUrl)) setActiveState(fromUrl);
  }, []);

  // Cambios sin guardar: el navegador avisa antes de salir de la ficha.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const setActive = useCallback((tab: ProductTabKey) => {
    setActiveState(tab);
    const url = new URL(window.location.href);
    if (tab === "general") url.searchParams.delete("solapa");
    else url.searchParams.set("solapa", tab);
    window.history.replaceState(window.history.state, "", url);
  }, []);

  useEffect(() => {
    const reveal = (event: Event) => {
      const tab = (event as CustomEvent<string>).detail;
      if (isTab(tab)) setActive(tab);
    };
    window.addEventListener(REVEAL_PRODUCT_TAB_EVENT, reveal);
    return () => window.removeEventListener(REVEAL_PRODUCT_TAB_EVENT, reveal);
  }, [setActive]);

  const value = useMemo(() => ({ active, setActive, dirty, setDirty }), [active, setActive, dirty]);
  return (
    <TabsContext.Provider value={value}>
      <ProductTabBar counts={counts} />
      {children}
    </TabsContext.Provider>
  );
}

function ProductTabBar({ counts }: { counts?: Partial<Record<ProductTabKey, number>> }) {
  const ctx = useContext(TabsContext)!;
  return (
    <div className="sticky top-0 z-30 -mx-1 border-b border-border bg-background/95 px-1 backdrop-blur" data-tour="product-nav">
      <div role="tablist" aria-label="Secciones del producto" className="flex gap-1 overflow-x-auto py-2">
        {PRODUCT_TABS.map((tab) => {
          const selected = ctx.active === tab.key;
          const count = counts?.[tab.key];
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={selected}
              onClick={() => ctx.setActive(tab.key)}
              className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                selected ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              }`}
            >
              {tab.label}
              {count ? <span className={`ml-1.5 rounded-full px-1.5 text-[11px] ${selected ? "bg-white/20" : "bg-secondary"}`}>{count}</span> : null}
            </button>
          );
        })}
        {ctx.dirty ? <span className="ml-auto shrink-0 self-center text-xs font-medium text-warning">Cambios sin guardar</span> : null}
      </div>
    </div>
  );
}

/** Contenido de una solapa. Fuera de la ficha (alta de producto) se muestra siempre. */
export function TabPane({ tab, children, className }: { tab: ProductTabKey; children: React.ReactNode; className?: string }) {
  const ctx = useContext(TabsContext);
  const hidden = ctx ? ctx.active !== tab : false;
  return (
    <div role={ctx ? "tabpanel" : undefined} data-product-tab={ctx ? tab : undefined} hidden={hidden} className={className}>
      {children}
    </div>
  );
}

/** Marca la ficha con cambios sin guardar (o la limpia al guardar). */
export function useProductTabsDirty(): (dirty: boolean) => void {
  const ctx = useContext(TabsContext);
  return useCallback((dirty: boolean) => ctx?.setDirty(dirty), [ctx]);
}
