"use client";

import { useMemo, useState } from "react";
import { Input, Select } from "@/components/ui/input";
import type { CategoryNode } from "@/lib/category-tree";

const LEVEL_LABELS = ["Rubro", "Subrubro", "Categoría", "Tipo"];

/**
 * Elegir el rubro de un producto en el árbol (hasta 4 niveles): se va bajando
 * de a un nivel o se busca por texto («embutir», «HDMI»). Se guarda el nivel
 * más profundo elegido, en un input oculto con `name`.
 */
export function CategoryTreePicker({
  nodes,
  name,
  defaultValue,
  id,
  onChange,
}: {
  nodes: CategoryNode[];
  name: string;
  defaultValue?: string | null;
  id?: string;
  /** Avisa el rubro elegido (el nivel más profundo). */
  onChange?: (categoryId: string) => void;
}) {
  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<string | null, CategoryNode[]>();
    for (const n of nodes) map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    return map;
  }, [nodes]);
  const pathOf = (leafId: string | null | undefined) => {
    const out: CategoryNode[] = [];
    let current = leafId ? byId.get(leafId) : undefined;
    while (current) {
      out.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return out;
  };
  const [selected, setSelectedState] = useState<string>(defaultValue ?? "");
  const setSelected = (next: string) => {
    setSelectedState(next);
    onChange?.(next);
  };
  const [query, setQuery] = useState("");
  const chain = pathOf(selected);
  const label = (n: CategoryNode) => pathOf(n.id).map((p) => p.name).join(" › ");

  const matches = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es-AR");
    if (q.length < 2) return [];
    return nodes
      .filter((n) => n.name.toLocaleLowerCase("es-AR").includes(q))
      .slice(0, 12)
      .map((n) => ({ id: n.id, text: label(n) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, nodes]);

  // Un select por nivel: el del nivel elegido y uno más abajo si tiene hijos.
  const levels: Array<{ parentId: string | null; value: string }> = [{ parentId: null, value: chain[0]?.id ?? "" }];
  chain.forEach((node, index) => {
    if ((children.get(node.id) ?? []).length && index < LEVEL_LABELS.length - 1) levels.push({ parentId: node.id, value: chain[index + 1]?.id ?? "" });
  });

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={selected} />
      <div className="relative">
        <Input id={id} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar rubro (ej. embutir, HDMI, botonera)" aria-label="Buscar rubro" />
        {matches.length ? (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-md border border-border bg-card text-sm shadow-lg">
            {matches.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="w-full px-3 py-1.5 text-left hover:bg-secondary"
                  onClick={() => {
                    setSelected(m.id);
                    setQuery("");
                  }}
                >
                  {m.text}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {levels.map((level, index) => (
          <Select
            key={`${index}-${level.parentId ?? "root"}`}
            aria-label={LEVEL_LABELS[index]}
            value={level.value}
            onChange={(e) => setSelected(e.target.value || (level.parentId ?? ""))}
          >
            <option value="">{index === 0 ? "Sin rubro" : `${LEVEL_LABELS[index]}: —`}</option>
            {(children.get(level.parentId) ?? []).map((n) => (
              <option key={n.id} value={n.id}>
                {n.name}
              </option>
            ))}
          </Select>
        ))}
      </div>
      {chain.length ? <p className="text-xs text-muted-foreground">{chain.map((n) => n.name).join(" › ")}</p> : null}
    </div>
  );
}
