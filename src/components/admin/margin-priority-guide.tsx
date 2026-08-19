import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const MARGIN_STEPS = [
  { n: 1, label: "Cliente + producto específico", example: "Acme Corp · Micrófono SM58" },
  { n: 2, label: "Cliente + marca", example: "Acme Corp · Shure" },
  { n: 3, label: "Cliente + categoría", example: "Acme Corp · Audio" },
  { n: 4, label: "Cliente + familia", example: "Acme Corp · Micrófonos" },
  { n: 5, label: "Cliente (regla general)", example: "Todo el catálogo de Acme" },
  { n: 6, label: "Producto (sin cliente)", example: "Un SKU puntual" },
  { n: 7, label: "Marca", example: "Toda la marca Shure" },
  { n: 8, label: "Proveedor", example: "Importador X" },
  { n: 9, label: "Familia", example: "Consolas digitales" },
  { n: 10, label: "Categoría", example: "Iluminación" },
  { n: 11, label: "Global", example: "Margen por defecto de la plataforma" },
];

const DISCOUNT_STEPS = [
  { n: 1, label: "Cliente + producto / marca / categoría / familia", example: "Regla comercial de un cliente" },
  { n: 2, label: "Cliente general", example: "Descuento a todo el catálogo de ese cliente" },
  { n: 3, label: "Descuento en la ficha del producto", example: "Campo % del producto: sí baja el precio aunque no haya regla acá" },
  { n: 4, label: "Regla de producto / marca / proveedor / familia / categoría", example: "Sin cliente" },
  { n: 5, label: "Regla global", example: "Toda la plataforma" },
];

export function MarginPriorityGuide() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="space-y-3 p-5">
          <div>
            <h3 className="text-sm font-semibold">Cómo se calcula el precio</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              1) Costo base USD → 2) + derecho arancelario % (si cargaste posición arancelaria) → 3) + margen
              → 4) − descuento. El cliente nunca ve el costo interno.
            </p>
          </div>
          <div className="rounded-md border border-border bg-card p-3 text-xs">
            <p className="font-medium text-foreground">Campo «Prioridad» en cada regla</p>
            <p className="mt-1 text-muted-foreground">
              Solo desempata reglas del <strong>mismo nivel</strong> (ej. dos reglas de «Marca»). Número{" "}
              <strong>menor = gana primero</strong>. No cambia el orden entre niveles (cliente+producto siempre
              gana a global).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 p-5">
          <h3 className="text-sm font-semibold">Orden de márgenes (de mayor a menor fuerza)</h3>
          <ol className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {MARGIN_STEPS.map((s) => (
              <li key={s.n} className="flex gap-2 rounded px-1 py-0.5 hover:bg-secondary/50">
                <Badge tone="muted" className="h-5 min-w-[1.25rem] shrink-0 justify-center px-1 text-[10px]">
                  {s.n}
                </Badge>
                <span>
                  <span className="font-medium text-foreground">{s.label}</span>
                  <span className="text-muted-foreground"> — {s.example}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardContent className="space-y-2 p-5">
          <h3 className="text-sm font-semibold">Orden de descuentos</h3>
          <ol className="grid gap-1 text-xs sm:grid-cols-2">
            {DISCOUNT_STEPS.map((s) => (
              <li key={s.n} className="flex gap-2">
                <Badge tone="accent" className="h-5 min-w-[1.25rem] shrink-0 justify-center px-1 text-[10px]">
                  {s.n}
                </Badge>
                <span>
                  <span className="font-medium">{s.label}</span>
                  <span className="text-muted-foreground"> — {s.example}</span>
                </span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
