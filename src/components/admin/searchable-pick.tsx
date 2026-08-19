"use client";

import { useMemo, useState } from "react";
import { Input, Select, Label } from "@/components/ui/input";

export function SearchablePick({
  label,
  options,
  value,
  onChange,
  placeholder = "Buscar…",
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
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    const list = query
      ? options.filter((option) => option.name.toLowerCase().includes(query))
      : options;
    const sliced = list.slice(0, 80);
    if (value && !sliced.some((option) => option.id === value)) {
      const selected = options.find((option) => option.id === value);
      if (selected) return [selected, ...sliced];
    }
    return sliced;
  }, [options, q, value]);
  const total = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return options.length;
    return options.filter((option) => option.name.toLowerCase().includes(query)).length;
  }, [options, q]);

  return (
    <div className={disabled ? "opacity-50" : undefined}>
      <Label required={required}>{label}</Label>
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="mb-1.5 h-9"
      />
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        required={required}
      >
        <option value="">Elegí…</option>
        {filtered.map((option) => (
          <option key={option.id} value={option.id}>
            {option.name}
          </option>
        ))}
      </Select>
      {total > filtered.length ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Mostrando 80 de {total}. Escribí para afinar.
        </p>
      ) : null}
    </div>
  );
}
