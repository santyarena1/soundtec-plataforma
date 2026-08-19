"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchablePick({
  label,
  options,
  value,
  values,
  onChange,
  onValuesChange,
  placeholder = "Escribí para buscar…",
  disabled,
  required,
  multiple = false,
}: {
  label: string;
  options: { id: string; name: string }[];
  value?: string;
  values?: string[];
  onChange?: (id: string) => void;
  onValuesChange?: (ids: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  multiple?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const selectedIds = multiple ? values || [] : value ? [value] : [];
  const selected = options.filter((option) => selectedIds.includes(option.id));
  const selectedSingle = selected[0] || null;

  useEffect(() => {
    if (multiple) return;
    if (!value) return;
    const name = options.find((option) => option.id === value)?.name;
    if (name) setQ(name);
  }, [value, multiple]);

  const filteredAll = useMemo(() => {
    const query = q.trim().toLowerCase();
    return query ? options.filter((option) => option.name.toLowerCase().includes(query)) : options;
  }, [options, q]);
  const filtered = filteredAll.slice(0, 80);

  useEffect(() => {
    function onDoc(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  function setSelected(ids: string[]) {
    if (multiple) onValuesChange?.(ids);
    else onChange?.(ids[0] || "");
  }

  function toggle(id: string) {
    if (!multiple) {
      setSelected([id]);
      setQ(options.find((item) => item.id === id)?.name ?? "");
      setOpen(false);
      return;
    }
    const next = selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id];
    setSelected(next);
  }

  function selectFiltered() {
    const ids = new Set(selectedIds);
    for (const option of filteredAll) ids.add(option.id);
    setSelected([...ids]);
  }

  function clearFiltered() {
    const drop = new Set(filteredAll.map((option) => option.id));
    setSelected(selectedIds.filter((id) => !drop.has(id)));
  }

  function onFocus() {
    if (disabled) return;
    setOpen(true);
    if (!multiple && selectedSingle && q === selectedSingle.name) setQ("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (event.key === "ArrowDown" || event.key === "Enter")) {
      setOpen(true);
      return;
    }
    if (!open) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(filtered.length - 1, 0)));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const option = filtered[active];
      if (option) toggle(option.id);
    } else if (event.key === "Escape") {
      setOpen(false);
      if (!multiple) setQ(selectedSingle?.name ?? "");
      inputRef.current?.blur();
    }
  }

  const allFilteredSelected = filteredAll.length > 0 && filteredAll.every((option) => selectedIds.includes(option.id));
  const inputValue = multiple || open ? q : selectedSingle?.name || q;

  return (
    <div ref={wrapRef} className={cn("relative flex min-w-0 flex-col gap-1.5", disabled && "opacity-50")}>
      <Label required={required} className="block h-5 leading-5">
        {label}
        {multiple && selectedIds.length > 0 ? (
          <span className="ml-1 font-normal text-muted-foreground">({selectedIds.length})</span>
        ) : null}
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={inputValue}
          onChange={(e) => {
            setQ(e.target.value);
            if (!multiple && value && e.target.value !== selectedSingle?.name) onChange?.("");
            setOpen(true);
          }}
          onFocus={onFocus}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className="h-10 pl-8 pr-8"
          aria-expanded={open}
          aria-controls={listId}
          role="combobox"
        />
        <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            {open ? (
          <ul
            id={listId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
          >
            {multiple && filteredAll.length > 0 ? (
              <li className="sticky top-0 border-b border-border bg-card px-2 py-1.5">
                <button
                  type="button"
                  className="text-xs font-medium text-primary"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={allFilteredSelected ? clearFiltered : selectFiltered}
                >
                  {allFilteredSelected
                    ? `Quitar ${filteredAll.length} de esta búsqueda`
                    : `Elegir ${filteredAll.length === options.length ? "todas" : `las ${filteredAll.length} de esta búsqueda`}`}
                </button>
              </li>
            ) : null}
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</li>
            ) : (
              filtered.map((option, index) => {
                const checked = selectedIds.includes(option.id);
                return (
                  <li key={option.id} role="option" aria-selected={checked}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-secondary/70",
                        checked && "bg-primary/10 font-medium",
                        index === active && "bg-secondary"
                      )}
                      onMouseEnter={() => setActive(index)}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => toggle(option.id)}
                    >
                      {multiple ? (
                        <input type="checkbox" readOnly checked={checked} className="pointer-events-none" />
                      ) : null}
                      <span>{option.name}</span>
                    </button>
                  </li>
                );
              })
            )}
            {filteredAll.length > filtered.length ? (
              <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
                Mostrando 80 de {filteredAll.length}. Seguí escribiendo para afinar.
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
      {multiple && selected.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {selected.slice(0, 12).map((option) => (
            <button
              key={option.id}
              type="button"
              className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary/60 px-2 py-0.5 text-xs"
              onClick={() => toggle(option.id)}
            >
              {option.name}
              <X className="h-3 w-3 text-muted-foreground" />
            </button>
          ))}
          {selected.length > 12 ? (
            <span className="self-center text-xs text-muted-foreground">+{selected.length - 12} más</span>
          ) : null}
        </div>
      ) : null}
      {required ? (
        <input type="hidden" value={selectedIds[0] || ""} required={selectedIds.length === 0} readOnly tabIndex={-1} />
      ) : null}
    </div>
  );
}
