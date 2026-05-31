"use client";

import { useState, useTransition } from "react";
import { setProductLabels } from "@/server/actions/labels";
import { Loader2, Tag } from "lucide-react";

interface LabelOption {
  id: string;
  name: string;
  color: string;
}

interface Props {
  productId: string;
  allLabels: LabelOption[];
  currentLabelIds: string[];
}

export function LabelSelector({ productId, allLabels, currentLabelIds }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set(currentLabelIds));
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaved(false);
  }

  function save() {
    setSaved(false);
    start(async () => {
      await setProductLabels(productId, [...selected]);
      setSaved(true);
    });
  }

  if (allLabels.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay etiquetas. <a href="/admin/labels" className="text-accent underline">Crear etiquetas</a>
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {allLabels.map((l) => {
          const active = selected.has(l.id);
          return (
            <button
              key={l.id}
              type="button"
              onClick={() => toggle(l.id)}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all"
              style={
                active
                  ? { backgroundColor: l.color, borderColor: l.color, color: "#fff" }
                  : { backgroundColor: "transparent", borderColor: l.color, color: l.color }
              }
            >
              <Tag className="h-3 w-3" />
              {l.name}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
          Guardar etiquetas
        </button>
        {saved && <span className="text-xs text-success">Guardado.</span>}
      </div>
    </div>
  );
}
