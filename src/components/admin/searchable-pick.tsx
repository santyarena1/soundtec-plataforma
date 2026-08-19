"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, Search } from "lucide-react";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchablePick({
  label,
  options,
  value,
  onChange,
  placeholder = "Escribí para buscar…",
  disabled,
  required,
}: {
  label: string;
  options: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const selected = options.find((option) => option.id === value) || null;

  useEffect(() => {
    if (!value) return;
    const name = options.find((option) => option.id === value)?.name;
    if (name) setQ(name);
  }, [value]);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? options.filter((option) => option.name.toLowerCase().includes(query))
      : options;
    return list.slice(0, 80);
  }, [options, q]);

  const total = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options.length;
    return options.filter((option) => option.name.toLowerCase().includes(query)).length;
  }, [options, q]);

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

  function pick(id: string) {
    const option = options.find((item) => item.id === id);
    onChange(id);
    setQ(option?.name ?? "");
    setOpen(false);
  }

  function onFocus() {
    if (disabled) return;
    setOpen(true);
    if (selected && q === selected.name) {
      setQ("");
    }
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
      if (option) pick(option.id);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQ(selected?.name ?? "");
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={wrapRef} className={cn("relative flex min-w-0 flex-col gap-1.5", disabled && "opacity-50")}>
      <Label required={required} className="block h-5 leading-5">
        {label}
      </Label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={open ? q : selected?.name || q}
          onChange={(e) => {
            setQ(e.target.value);
            if (value && e.target.value !== selected?.name) onChange("");
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
            className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card shadow-lg"
          >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted-foreground">Sin resultados.</li>
          ) : (
            filtered.map((option, index) => (
              <li key={option.id} role="option" aria-selected={option.id === value}>
                <button
                  type="button"
                  className={cn(
                    "w-full px-3 py-1.5 text-left text-sm hover:bg-secondary/70",
                    option.id === value && "bg-primary/10 font-medium",
                    index === active && "bg-secondary"
                  )}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(option.id)}
                >
                  {option.name}
                </button>
              </li>
            ))
          )}
          {total > filtered.length ? (
            <li className="border-t border-border px-3 py-1.5 text-[11px] text-muted-foreground">
              Mostrando 80 de {total}. Seguí escribiendo para afinar.
            </li>
          ) : null}
          </ul>
        ) : null}
      </div>
      {required ? <input type="hidden" value={value} required readOnly tabIndex={-1} /> : null}
    </div>
  );
}
