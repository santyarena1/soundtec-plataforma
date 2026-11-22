"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, Loader2, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { CategoryNode } from "@/lib/category-tree";
import { TANGO_MAX_LEVEL } from "@/lib/tango-tree";
import { createSubrubroAction, describeCategoriesAction, type DescribedCategory } from "@/server/actions/rubros";

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es-AR");

export interface RubroPickerProps {
  nodes: CategoryNode[];
  /** Nombre del input oculto (uno por valor en modo múltiple). */
  name?: string;
  multiple?: boolean;
  defaultValue?: string | null;
  defaultValues?: string[];
  /** Modo controlado (opcional). */
  values?: string[];
  onValuesChange?: (ids: string[]) => void;
  /** Avisa el rubro elegido (modo simple). */
  onChange?: (categoryId: string) => void;
  /** Muestra «Crear subrubro acá» (el servidor igual exige permiso de catálogo). */
  allowCreate?: boolean;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  /** En modo simple, permite «Sin rubro». */
  allowEmpty?: boolean;
}

/**
 * Selector único de rubro del árbol de Tango: buscador por toda la ruta,
 * navegación por niveles, rubros vacíos incluidos, cantidad de productos por
 * nodo y (si se permite) «Crear subrubro acá». Si el dato tiene un rubro viejo
 * o inactivo, lo muestra marcado en vez de esconderlo.
 */
export function RubroPicker({
  nodes: initialNodes,
  name,
  multiple = false,
  defaultValue,
  defaultValues,
  values: controlled,
  onValuesChange,
  onChange,
  allowCreate = false,
  id,
  placeholder,
  disabled,
  allowEmpty = true,
}: RubroPickerProps) {
  const [nodes, setNodes] = useState(initialNodes);
  useEffect(() => setNodes(initialNodes), [initialNodes]);
  const [internal, setInternal] = useState<string[]>(
    defaultValues?.filter(Boolean) ?? (defaultValue ? [defaultValue] : [])
  );
  const selected = controlled ?? internal;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [browseId, setBrowseId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [described, setDescribed] = useState<Map<string, DescribedCategory>>(new Map());
  const rootRef = useRef<HTMLDivElement>(null);

  const byId = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const children = useMemo(() => {
    const map = new Map<string | null, CategoryNode[]>();
    for (const n of nodes) map.set(n.parentId, [...(map.get(n.parentId) ?? []), n]);
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name, "es"));
    return map;
  }, [nodes]);
  const totals = useMemo(() => {
    const total = new Map<string, number>();
    const visit = (n: CategoryNode): number => {
      const cached = total.get(n.id);
      if (cached != null) return cached;
      const sum = (n.count ?? 0) + (children.get(n.id) ?? []).reduce((acc, c) => acc + visit(c), 0);
      total.set(n.id, sum);
      return sum;
    };
    nodes.forEach(visit);
    return total;
  }, [nodes, children]);
  const descendantCount = (nodeId: string): number =>
    (children.get(nodeId) ?? []).reduce((acc, c) => acc + 1 + descendantCount(c.id), 0);
  const pathOf = (nodeId: string | null | undefined): CategoryNode[] => {
    const out: CategoryNode[] = [];
    let current = nodeId ? byId.get(nodeId) : undefined;
    while (current && out.length < 8) {
      out.unshift(current);
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return out;
  };
  const pathLabel = (nodeId: string) => pathOf(nodeId).map((n) => n.name).join(" › ");

  // Valores que no están en el árbol activo: se piden al servidor para mostrarlos marcados.
  const unknown = selected.filter((v) => v && !byId.has(v) && !described.has(v));
  const unknownKey = unknown.join(",");
  useEffect(() => {
    if (!unknownKey) return;
    let alive = true;
    describeCategoriesAction(unknownKey.split(","))
      .then((rows) => {
        if (alive) setDescribed((prev) => new Map([...prev, ...rows.map((r) => [r.id, r] as const)]));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [unknownKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function commit(next: string[]) {
    if (!controlled) setInternal(next);
    onValuesChange?.(next);
    if (!multiple) onChange?.(next[0] ?? "");
  }

  function choose(nodeId: string) {
    if (multiple) {
      commit(selected.includes(nodeId) ? selected.filter((v) => v !== nodeId) : [...selected, nodeId]);
      if (query) {
        setQuery("");
        setOpen(false);
      }
      return;
    }
    commit([nodeId]);
    setOpen(false);
    setQuery("");
  }

  const matches = useMemo(() => {
    const tokens = fold(query).split(/\s+/).filter((t) => t.length >= 2);
    if (!tokens.length) return [];
    const scored: Array<{ node: CategoryNode; label: string; score: number }> = [];
    for (const n of nodes) {
      const label = pathLabel(n.id);
      const folded = fold(label);
      if (!tokens.every((t) => folded.includes(t))) continue;
      const own = fold(n.name);
      const score = (tokens.some((t) => own.includes(t)) ? 0 : 10) + n.level;
      scored.push({ node: n, label, score });
    }
    return scored.sort((a, b) => a.score - b.score || a.label.localeCompare(b.label, "es")).slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, nodes]);

  async function createHere() {
    if (!browseId) return;
    setBusy(true);
    try {
      const result = await createSubrubroAction(browseId, newName);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const node: CategoryNode = {
        id: result.node.id,
        name: result.node.name,
        parentId: result.node.parentId,
        level: result.node.level,
        count: 0,
        pendingTango: true,
      };
      setNodes((prev) => [...prev, node]);
      toast.success(`Se creó «${result.node.name}». Queda pendiente de cargar en Tango.`);
      setCreating(false);
      setNewName("");
      choose(node.id);
    } catch {
      toast.error("No se pudo crear el subrubro.");
    } finally {
      setBusy(false);
    }
  }

  const browsing = browseId ? byId.get(browseId) ?? null : null;
  const list = children.get(browseId) ?? [];
  const canCreateHere = allowCreate && browsing && browsing.level < TANGO_MAX_LEVEL;

  function renderValue(v: string) {
    const node = byId.get(v);
    if (node) {
      return { label: pathLabel(v), warn: null as string | null };
    }
    const d = described.get(v);
    const label = d?.label ?? "…";
    const warn =
      d?.state === "uncategorized"
        ? "Sin categorizar: elegí un rubro del árbol."
        : d?.state === "old"
          ? "Rubro viejo (fuera del árbol de Tango): elegí uno del árbol."
          : d?.state === "inactive"
            ? "Rubro desactivado: elegí otro."
            : d?.state === "missing"
              ? "El rubro ya no existe."
              : null;
    return { label, warn };
  }

  return (
    <div ref={rootRef} className="relative space-y-1.5">
      {name ? selected.map((v) => <input key={v} type="hidden" name={name} value={v} />) : null}
      {name && !multiple && selected.length === 0 ? <input type="hidden" name={name} value="" /> : null}

      {multiple && selected.length ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((v) => {
            const { label, warn } = renderValue(v);
            const subs = byId.has(v) ? descendantCount(v) : 0;
            return (
              <span
                key={v}
                className={cn(
                  "inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  warn ? "border-amber-400 bg-amber-50 text-amber-900" : "border-border bg-secondary/60"
                )}
                title={warn ?? undefined}
              >
                {warn ? <AlertTriangle className="h-3 w-3 shrink-0" /> : null}
                <span className="truncate">{label}</span>
                {subs ? <span className="text-muted-foreground">· incluye {subs} subrubros</span> : null}
                {!disabled ? (
                  <button type="button" aria-label={`Quitar ${label}`} onClick={() => commit(selected.filter((x) => x !== v))}>
                    <X className="h-3 w-3" />
                  </button>
                ) : null}
              </span>
            );
          })}
        </div>
      ) : null}

      {!multiple ? (
        <div className="text-sm">
          {selected[0] ? (
            (() => {
              const { label, warn } = renderValue(selected[0]);
              return (
                <p className={cn("leading-snug", warn && "text-amber-800")} data-testid="rubro-picker-value">
                  {warn ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}
                  {label}
                  {warn ? <span className="block text-xs">{warn}</span> : null}
                </p>
              );
            })()
          ) : (
            <p className="text-muted-foreground" data-testid="rubro-picker-value">{placeholder ?? "Sin rubro"}</p>
          )}
        </div>
      ) : null}

      <div className="flex gap-2">
        <Input
          id={id}
          value={query}
          disabled={disabled}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(e.target.value.trim().length >= 2 || open);
          }}
          onFocus={() => {
            if (query.trim().length >= 2) setOpen(true);
          }}
          placeholder={multiple ? "Buscar rubro para agregar (ej. embutir techo, keypad)" : "Buscar rubro (ej. embutir techo, HDMI, keypad)"}
          aria-label="Buscar rubro"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 whitespace-nowrap"
          disabled={disabled}
          aria-expanded={open && query.trim().length < 2}
          onClick={() => {
            setQuery("");
            if (!open && !multiple && selected[0] && byId.has(selected[0])) setBrowseId(byId.get(selected[0])!.parentId);
            setOpen((o) => !(o && query.trim().length < 2));
          }}
        >
          Ver árbol
          <ChevronRight className={cn("h-4 w-4 transition-transform", open && query.trim().length < 2 && "rotate-90")} />
        </Button>
      </div>

      {open ? (
        <div role="dialog" aria-label="Elegir rubro" className="absolute z-30 mt-1 w-full min-w-[18rem] rounded-md border border-border bg-card shadow-xl">
          {query.trim().length >= 2 ? (
            <ul className="max-h-72 overflow-auto py-1 text-sm">
              {matches.length === 0 ? <li className="px-3 py-2 text-muted-foreground">No hay rubros con ese texto.</li> : null}
              {matches.map((m) => (
                <li key={m.node.id}>
                  <button type="button" className="flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-secondary" onClick={() => choose(m.node.id)}>
                    {selected.includes(m.node.id) ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5" />}
                    <span className="min-w-0 flex-1">{m.label}</span>
                    {m.node.pendingTango ? <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-900">pendiente en Tango</span> : null}
                    <span className="text-xs tabular-nums text-muted-foreground">{totals.get(m.node.id) ?? 0}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm">
              <div className="flex items-center gap-1 border-b border-border px-2 py-1.5">
                {browsing ? (
                  <button type="button" className="rounded p-1 hover:bg-secondary" aria-label="Subir un nivel" onClick={() => setBrowseId(browsing.parentId)}>
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                ) : null}
                <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                  {browsing ? pathLabel(browsing.id) : "Rubros principales"}
                </span>
                {browsing ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => choose(browsing.id)}>
                    {selected.includes(browsing.id) ? "Elegido" : "Elegir este"}
                  </Button>
                ) : null}
              </div>
              <ul className="max-h-64 overflow-auto py-1">
                {list.length === 0 ? <li className="px-3 py-2 text-muted-foreground">No tiene subrubros.</li> : null}
                {list.map((n) => {
                  const hasKids = (children.get(n.id) ?? []).length > 0;
                  return (
                    <li key={n.id} className="flex items-center hover:bg-secondary/60">
                      <button type="button" className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left" onClick={() => choose(n.id)}>
                        {selected.includes(n.id) ? <Check className="h-3.5 w-3.5 shrink-0 text-primary" /> : <span className="w-3.5" />}
                        <span className="min-w-0 flex-1 truncate">{n.name}</span>
                        {n.pendingTango ? <span className="rounded bg-amber-100 px-1 text-[10px] text-amber-900">pendiente en Tango</span> : null}
                        <span className="text-xs tabular-nums text-muted-foreground">{totals.get(n.id) ?? 0}</span>
                      </button>
                      {hasKids ? (
                        <button type="button" className="px-2 py-1.5 text-muted-foreground hover:text-foreground" aria-label={`Ver subrubros de ${n.name}`} onClick={() => setBrowseId(n.id)}>
                          <ChevronRight className="h-4 w-4" />
                        </button>
                      ) : (
                        <span className="w-8" />
                      )}
                    </li>
                  );
                })}
              </ul>
              {canCreateHere ? (
                <div className="border-t border-border p-2">
                  {creating ? (
                    <div className="flex gap-2">
                      <Input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder="Nombre del subrubro"
                        aria-label="Nombre del subrubro nuevo"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            void createHere();
                          }
                        }}
                      />
                      <Button type="button" size="sm" disabled={busy || newName.trim().length < 2} onClick={() => void createHere()}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear"}
                      </Button>
                    </div>
                  ) : (
                    <button type="button" className="inline-flex items-center gap-1 text-xs font-medium text-primary" onClick={() => setCreating(true)}>
                      <Plus className="h-3.5 w-3.5" /> Crear subrubro acá
                    </button>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">Queda marcado «pendiente en Tango» hasta que lo cargues allá.</p>
                </div>
              ) : null}
            </div>
          )}
          {!multiple && allowEmpty && selected.length ? (
            <div className="border-t border-border px-3 py-1.5">
              <button type="button" className="text-xs text-muted-foreground hover:text-foreground" onClick={() => { commit([]); setOpen(false); }}>
                Quitar rubro
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
