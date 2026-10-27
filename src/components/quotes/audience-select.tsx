"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/input";
import type { QuoteAudienceOption } from "@/lib/quote-audiences";

export const AUDIENCES_SETTINGS_HREF = "/admin/settings/quotes#a-quien-va";
const ADD = "__agregar__";

/**
 * «A quién va»: vacío por defecto; las opciones se crean en Configuración. La
 * última opción («Agregar…») lleva ahí. Sirve con `name` (formulario) o
 * controlado con `value`/`onChange`.
 */
export function AudienceSelect({
  id,
  name,
  audiences,
  defaultValue,
  value,
  onChange,
}: {
  id: string;
  name?: string;
  audiences: QuoteAudienceOption[];
  defaultValue?: string | null;
  value?: string;
  onChange?: (key: string) => void;
}) {
  const router = useRouter();
  const [inner, setInner] = useState(defaultValue ?? "");
  const current = value ?? inner;
  return (
    <div className="space-y-1">
      <Select
        id={id}
        name={name}
        value={current}
        onChange={(e) => {
          if (e.target.value === ADD) return void router.push(AUDIENCES_SETTINGS_HREF);
          setInner(e.target.value);
          onChange?.(e.target.value);
        }}
      >
        <option value="">Sin elegir</option>
        {audiences.map((a) => (
          <option key={a.key} value={a.key}>
            {a.label}
          </option>
        ))}
        <option value={ADD}>＋ Agregar a quién va…</option>
      </Select>
      {audiences.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Todavía no hay opciones.{" "}
          <Link href={AUDIENCES_SETTINGS_HREF} className="text-accent hover:underline">
            Crealas en Configuración
          </Link>{" "}
          (ej. Hotelería, Escuelas) para tener textos del PDF para cada una.
        </p>
      ) : null}
    </div>
  );
}
