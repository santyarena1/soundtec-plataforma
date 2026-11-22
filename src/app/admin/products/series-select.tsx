"use client";

import Link from "next/link";
import { Label, Select } from "@/components/ui/input";
import { FieldStamp } from "./field-stamp";

type SeriesOption = { id: string; name: string; brandId: string };

/**
 * «Serie del fabricante» en la ficha del producto: solo las series de la marca
 * elegida. Se manda como `lineId`; vacío = sin serie.
 */
export function SeriesSelect({ series, brandId, defaultValue, at }: { series: SeriesOption[]; brandId: string; defaultValue: string; at?: string }) {
  const options = series.filter((s) => s.brandId === brandId);
  const initial = options.some((s) => s.id === defaultValue) ? defaultValue : "";
  return (
    <div>
      <Label htmlFor="lineId">Serie del fabricante</Label>
      {/* key: al cambiar de marca se vuelve a «sin serie» (una serie es de una sola marca). */}
      <Select key={brandId} id="lineId" name="lineId" defaultValue={initial} disabled={!brandId}>
        <option value="">{brandId ? (options.length ? "Sin serie" : "Esta marca no tiene series") : "Elegí primero la marca"}</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </Select>
      <p className="mt-1 text-xs text-muted-foreground">
        Colección de la marca (Horizon, Landscape, CBL…): chip en el catálogo, «Más de la serie» y compatibilidad.{" "}
        <Link href="/admin/categories/series" className="underline-offset-2 hover:underline">
          Ver series
        </Link>
      </p>
      <FieldStamp at={at} />
    </div>
  );
}
