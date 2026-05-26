"use client";

import { useState, type ReactNode } from "react";

interface Tab {
  id: string;
  label: string;
  content: ReactNode;
}

interface Props {
  tabs: Tab[];
  defaultTab?: string;
}

/**
 * Pestañas client-side simples. Cero dependencias externas.
 * El padre arma el contenido completo y se renderiza solo la pestaña activa.
 */
export function Tabs({ tabs, defaultTab }: Props) {
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "");
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActive(t.id)}
            className={`relative -mb-px px-3 py-2 text-sm font-medium transition-colors ${
              active === t.id
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.id} className={active === t.id ? "" : "hidden"}>
          {t.content}
        </div>
      ))}
    </div>
  );
}
