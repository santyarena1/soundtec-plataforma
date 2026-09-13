import {
  createQuoteAlternative,
  deleteQuoteAlternative,
  renameQuoteAlternative,
} from "@/server/actions/quote-alternatives";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { formatUsd } from "@/lib/utils";

interface AlternativeRow {
  id: string;
  name: string;
  purpose: string | null;
  sortOrder: number;
}

/**
 * Opciones cotizadas. Con una sola, el documento sale como siempre y el panel
 * solo ofrece agregar una segunda. Con más de una, cada opción lleva su tabla
 * y su total en el documento, y el cliente elige.
 */
export function QuoteAlternativesPanel({
  quoteId,
  alternatives,
  totals,
  issued,
}: {
  quoteId: string;
  alternatives: AlternativeRow[];
  /** Total por opción, para que se vea la diferencia de precio sin abrir el PDF. */
  totals: Map<string, { count: number; amount: number }>;
  issued: boolean;
}) {
  const multiple = alternatives.length > 1;

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-medium">Opciones cotizadas</h3>
            <p className="text-xs text-muted-foreground">
              {multiple
                ? "El documento muestra una tabla y un total por opción. El cliente elige una."
                : "Sirven para presentar dos soluciones al mismo proyecto, por ejemplo una básica y una completa."}
            </p>
          </div>
          {!issued ? (
            <form action={createQuoteAlternative}>
              <input type="hidden" name="quoteId" value={quoteId} />
              <Button type="submit" size="sm" variant="outline">
                Agregar opción
              </Button>
            </form>
          ) : null}
        </div>

        <ul className="space-y-2">
          {alternatives.map((alternative, index) => {
            const summary = totals.get(alternative.id);
            return (
              <li key={alternative.id} className="rounded-md border border-border p-3">
                <form action={renameQuoteAlternative} className="space-y-2">
                  <input type="hidden" name="alternativeId" value={alternative.id} />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      name="name"
                      defaultValue={alternative.name}
                      disabled={issued}
                      className="h-9 max-w-[16rem]"
                    />
                    <Badge tone={summary?.count ? "success" : "muted"}>
                      {summary?.count
                        ? `${summary.count} ${summary.count === 1 ? "ítem" : "ítems"} · ${formatUsd(summary.amount)}`
                        : "Sin ítems"}
                    </Badge>
                    {index === 0 ? <Badge tone="muted">Por defecto</Badge> : null}
                  </div>
                  <Input
                    name="purpose"
                    defaultValue={alternative.purpose || ""}
                    placeholder="Para qué sirve esta opción (sale en el documento)"
                    disabled={issued}
                    className="h-9"
                  />
                  {!issued ? (
                    <div className="flex gap-2">
                      <Button type="submit" size="sm" variant="outline">
                        Guardar
                      </Button>
                      {multiple ? (
                        <Button
                          type="submit"
                          size="sm"
                          variant="ghost"
                          formAction={deleteQuoteAlternative}
                          title="Los ítems vuelven a la primera opción"
                        >
                          Quitar
                        </Button>
                      ) : null}
                    </div>
                  ) : null}
                </form>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
