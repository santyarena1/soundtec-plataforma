"use client";

import { useState } from "react";
import { ChevronDown, ListTree } from "lucide-react";
import { cn } from "@/lib/utils";

/** Botón «Rubros» para pantallas donde no entra la columna: despliega el mismo árbol. */
export function CategoryDropdown({ label, beside, children }: { label: string; beside?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="w-full">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 items-center gap-2 rounded-md border px-3 text-sm font-medium transition-colors",
            open ? "border-primary/40 bg-primary/5 text-foreground" : "border-border bg-card hover:border-primary/40"
          )}
        >
          <ListTree className="h-4 w-4 text-muted-foreground" />
          {label}
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </button>
        {beside}
      </div>
      {open ? (
        <div className="mt-2 sm:max-w-md">{children}</div>
      ) : null}
    </div>
  );
}
