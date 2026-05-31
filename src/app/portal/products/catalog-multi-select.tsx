"use client";

import { useState, useTransition } from "react";
import { ShoppingCart, X, Loader2, CheckSquare } from "lucide-react";
import { bulkAddToDraftSimple } from "@/server/actions/requests";
import { useRouter } from "next/navigation";

interface Props {
  children: React.ReactNode;
  productIds: string[];
}

export function CatalogMultiSelectProvider({ children, productIds }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMsg(null);
  }

  function selectAll() {
    setSelected(new Set(productIds));
    setMsg(null);
  }

  function clearAll() {
    setSelected(new Set());
    setMsg(null);
  }

  function addAll() {
    if (!selected.size) return;
    start(async () => {
      const r = await bulkAddToDraftSimple([...selected]);
      if (r.ok) {
        setMsg(`${r.added} producto(s) agregado(s) a tu solicitud.`);
        setSelected(new Set());
        router.refresh();
      } else {
        setMsg(r.error || "Error al agregar.");
      }
    });
  }

  return (
    <MultiSelectContext.Provider value={{ selected, toggle }}>
      {children}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-3 rounded-xl border border-primary/30 bg-card px-5 py-3 shadow-2xl ring-1 ring-primary/10">
            <CheckSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm font-medium">
              {selected.size} producto{selected.size !== 1 ? "s" : ""} seleccionado{selected.size !== 1 ? "s" : ""}
            </span>
            {msg ? (
              <span className="text-xs text-success">{msg}</span>
            ) : null}
            <button
              onClick={selectAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Todos
            </button>
            <button
              onClick={clearAll}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={addAll}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
              Agregar a solicitud
            </button>
          </div>
        </div>
      )}
    </MultiSelectContext.Provider>
  );
}

import { createContext, useContext } from "react";

interface MultiSelectCtx {
  selected: Set<string>;
  toggle: (id: string) => void;
}

const MultiSelectContext = createContext<MultiSelectCtx>({
  selected: new Set(),
  toggle: () => {},
});

export function useMultiSelect() {
  return useContext(MultiSelectContext);
}

export function SelectableCard({
  productId,
  children,
}: {
  productId: string;
  children: React.ReactNode;
}) {
  const { selected, toggle } = useMultiSelect();
  const isSelected = selected.has(productId);

  return (
    <div className="relative group/selectable">
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(productId);
        }}
        aria-label={isSelected ? "Deseleccionar" : "Seleccionar"}
        className={`absolute left-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-md border-2 transition-all ${
          isSelected
            ? "border-primary bg-primary text-primary-foreground opacity-100"
            : "border-border/60 bg-card/80 text-transparent opacity-0 group-hover/selectable:opacity-100"
        }`}
      >
        {isSelected ? "✓" : ""}
      </button>
      <div
        className={`transition-all ${isSelected ? "ring-2 ring-primary ring-offset-1 rounded-xl" : ""}`}
      >
        {children}
      </div>
    </div>
  );
}
