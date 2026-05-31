"use client";

import { useState, useTransition, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { setProductLabels, upsertLabel } from "@/server/actions/labels";
import { Loader2, Tag, Plus, X, ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";

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

export function LabelSelector({ productId, allLabels: initialLabels, currentLabelIds }: Props) {
  const router = useRouter();
  const [labels, setLabels] = useState<LabelOption[]>(initialLabels);
  const [selected, setSelected] = useState<Set<string>>(new Set(currentLabelIds));
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState("#6366f1");
  const [saving, startSave] = useTransition();
  const [creating, startCreate] = useTransition();
  const [saved, setSaved] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  function toggle(id: string) {
    setSaved(false);
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    const ids = [...next];
    startSave(async () => {
      await setProductLabels(productId, ids);
      setSaved(true);
    });
  }

  function handleCreate() {
    if (!newName.trim()) return;
    const name = newName.trim();
    const color = newColor;
    startCreate(async () => {
      const fd = new FormData();
      fd.set("name", name);
      fd.set("color", color);
      await upsertLabel(fd);
      setLabels((prev) => [...prev, { id: `pending-${name}`, name, color }]);
      setNewName("");
      setNewColor("#6366f1");
      setCreateOpen(false);
      router.refresh();
    });
  }

  const selectedLabels = labels.filter((l) => selected.has(l.id));

  return (
    <div className="space-y-2">
      {/* Chips de etiquetas activas */}
      <div className="flex flex-wrap gap-1.5 min-h-[28px]">
        {selectedLabels.map((l) => (
          <span
            key={l.id}
            className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-white"
            style={{ backgroundColor: l.color }}
          >
            {l.name}
            <button
              type="button"
              onClick={() => toggle(l.id)}
              className="ml-0.5 opacity-70 hover:opacity-100"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        {selectedLabels.length === 0 && (
          <span className="text-xs text-muted-foreground">Sin etiquetas</span>
        )}
        {saving && <Loader2 className="h-3.5 w-3.5 animate-spin self-center text-muted-foreground" />}
        {saved && !saving && <span className="text-xs text-success self-center">Guardado</span>}
      </div>

      {/* Dropdown picker */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((s) => !s)}
          className="inline-flex items-center gap-1.5 rounded-md border border-border bg-secondary px-3 py-1.5 text-xs font-medium hover:bg-secondary/70"
        >
          <Tag className="h-3.5 w-3.5" />
          Gestionar etiquetas
          <ChevronDown className="h-3 w-3 opacity-60" />
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-card shadow-lg">
            {/* Lista de etiquetas */}
            <div className="max-h-52 overflow-y-auto p-1">
              {labels.length === 0 && (
                <p className="px-3 py-2 text-xs text-muted-foreground">No hay etiquetas. Creá una abajo.</p>
              )}
              {labels.map((l) => {
                const active = selected.has(l.id);
                return (
                  <button
                    key={l.id}
                    type="button"
                    onClick={() => toggle(l.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left text-xs transition-colors hover:bg-secondary ${active ? "bg-secondary" : ""}`}
                  >
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: l.color }} />
                    <span className="flex-1">{l.name}</span>
                    {active && <span className="text-success">✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Separador + crear */}
            <div className="border-t border-border p-2">
              {!createOpen ? (
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-accent hover:bg-secondary"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Crear etiqueta
                </button>
              ) : (
                <div className="space-y-2 px-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={newColor}
                      onChange={(e) => setNewColor(e.target.value)}
                      className="h-7 w-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    />
                    <Input
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      placeholder="Nombre de etiqueta"
                      className="h-7 text-xs"
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleCreate(); } }}
                      autoFocus
                    />
                  </div>
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={handleCreate}
                      disabled={creating || !newName.trim()}
                      className="flex-1 rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                    >
                      {creating ? <Loader2 className="mx-auto h-3 w-3 animate-spin" /> : "Crear"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreateOpen(false)}
                      className="rounded-md border border-border px-2 py-1 text-xs hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
