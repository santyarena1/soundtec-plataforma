"use client";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";

export function PriceLogicHint({ variant }: { variant: "margin" | "discount" | "visibility" }) {
  const [open, setOpen] = useState(false);

  if (variant === "visibility") {
    return (
      <Card>
        <CardContent className="space-y-2 p-5 text-sm">
          <p className="font-medium">Por defecto el cliente ve todo el catálogo.</p>
          <p className="text-muted-foreground">
            Acá solo cargás excepciones: ocultá marcas, familias o productos que ese cliente no
            tiene que ver. Si no hay regla, se muestra.
          </p>
          <button
            type="button"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary"
            onClick={() => setOpen((v) => !v)}
          >
            Personalización profunda
            <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
          </button>
          {open ? (
            <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
              <li>Ocultar es lista negra: el resto sigue visible.</li>
              <li>
                “Solo mostrar estos” es lista blanca: sirve si un cliente tiene un catálogo muy
                chico. Queda en opciones avanzadas del formulario.
              </li>
              <li>Una marca oculta esconde todos sus productos, no hace falta ir SKU por SKU.</li>
            </ul>
          ) : null}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-2 p-5 text-sm">
        <p className="font-medium">
          {variant === "margin"
            ? "El precio de lista sale del costo nacionalizado × markup."
            : "El descuento se aplica después del precio de lista."}
        </p>
        <p className="text-muted-foreground">
          Gana la regla más específica: un producto de un cliente pisa a la marca, y la marca pisa
          a “todos”. No hace falta un número de prioridad.
        </p>
        {variant === "margin" ? (
          <p className="text-muted-foreground">
            Markup ×1,35 es lo mismo que margen 35%. Elegí cómo te resulta más natural cargarlo.
          </p>
        ) : (
          <p className="text-muted-foreground">
            Si el catálogo muestra un -% y acá no hay regla, mirá los descuentos de ficha más
            abajo: esos sí bajan el precio.
          </p>
        )}
        <button
          type="button"
          className="inline-flex items-center gap-1 text-xs font-medium text-primary"
          onClick={() => setOpen((v) => !v)}
        >
          Personalización profunda
          <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <ol className="list-decimal space-y-1 pl-4 text-xs text-muted-foreground">
            <li>Cliente + producto</li>
            <li>Cliente + marca / categoría / familia / proveedor</li>
            <li>Todo el catálogo de ese cliente</li>
            {variant === "discount" ? <li>Descuento cargado en la ficha del producto</li> : null}
            <li>Producto, marca, proveedor, familia o categoría (para todos)</li>
            <li>Regla global / markup por defecto de la plataforma</li>
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}
