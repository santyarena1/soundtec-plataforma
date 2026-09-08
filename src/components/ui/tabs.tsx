"use client";

import { useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

interface Tab { id: string; label: string; content: ReactNode }
interface Props { tabs: Tab[]; defaultTab?: string; syncParam?: string }

export function Tabs({ tabs, defaultTab, syncParam }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [active, setActive] = useState(defaultTab || tabs[0]?.id || "");

  function select(id: string) {
    setActive(id);
    if (!syncParam) return;
    const next = new URLSearchParams(searchParams.toString());
    next.set(syncParam, id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b border-border" role="tablist">
        {tabs.map((tab) => (
          <button key={tab.id} type="button" role="tab" aria-selected={active === tab.id} onClick={() => select(tab.id)}
            className={`relative -mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${active === tab.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {tab.label}
          </button>
        ))}
      </div>
      {tabs.map((tab) => <div key={tab.id} role="tabpanel" className={active === tab.id ? "" : "hidden"}>{tab.content}</div>)}
    </div>
  );
}