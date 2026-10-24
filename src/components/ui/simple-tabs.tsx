"use client";

import { useEffect, useState } from "react";

/**
 * Solapas simples: los paneles quedan montados (solo se ocultan) y la solapa
 * activa va en la URL (?solapa=…). El contenido puede venir del servidor.
 */
export function SimpleTabs({ tabs, param = "solapa" }: { tabs: Array<{ key: string; label: string; content: React.ReactNode }>; param?: string }) {
  const [active, setActive] = useState(tabs[0]?.key ?? "");

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(param);
    if (fromUrl && tabs.some((t) => t.key === fromUrl)) setActive(fromUrl);
  }, [param, tabs]);

  function select(key: string) {
    setActive(key);
    const url = new URL(window.location.href);
    if (key === tabs[0]?.key) url.searchParams.delete(param);
    else url.searchParams.set(param, key);
    window.history.replaceState(window.history.state, "", url);
  }

  return (
    <div className="space-y-4">
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => select(tab.key)}
            className={`shrink-0 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              active === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => (
        <div key={tab.key} role="tabpanel" hidden={active !== tab.key} className="space-y-4">
          {tab.content}
        </div>
      ))}
    </div>
  );
}
