import { Badge } from "@/components/ui/badge";
import { CUSTOMER_STOCK_LABEL, ORIGIN_STOCK_LABEL, SHOW_STOCK_TO_CUSTOMERS, originStockText } from "@/lib/stock-display";

/**
 * Stock de un producto según quién mira:
 *  - Cliente o visitante: «Consultá stock» (no se muestra el stock del proveedor).
 *  - Equipo Soundtec (`internal`): el stock en origen, con su rótulo, para no
 *    confundirlo con la disponibilidad que se le confirma al cliente.
 */
export function StockBadge({ status, qty, internal = false }: { status: string; qty: number | null; internal?: boolean }) {
  if (internal) {
    const origin = originStockText(status, qty);
    return (
      <Badge tone="muted" title={`${ORIGIN_STOCK_LABEL}: ${origin.text}. El cliente ve «${CUSTOMER_STOCK_LABEL}».`}>
        Origen: {origin.text}
      </Badge>
    );
  }
  if (SHOW_STOCK_TO_CUSTOMERS) {
    const origin = originStockText(status, qty);
    return <Badge tone={origin.tone}>{origin.text}</Badge>;
  }
  return <Badge tone="muted">{CUSTOMER_STOCK_LABEL}</Badge>;
}

/** Bloque de la ficha para el equipo: stock en origen bien separado de lo que ve el cliente. */
export function OriginStockPanel({ status, qty }: { status: string; qty: number | null }) {
  const origin = originStockText(status, qty);
  return (
    <dl className="grid grid-cols-1 gap-2 rounded-md border border-dashed border-border bg-secondary/40 p-3 text-xs sm:grid-cols-2">
      <div>
        <dt className="font-semibold uppercase tracking-wider text-muted-foreground">{ORIGIN_STOCK_LABEL}</dt>
        <dd className="mt-1">
          <Badge tone="muted">{origin.text}</Badge>
        </dd>
      </div>
      <div>
        <dt className="font-semibold uppercase tracking-wider text-muted-foreground">Lo que ve el cliente</dt>
        <dd className="mt-1">
          <Badge tone="muted">{CUSTOMER_STOCK_LABEL}</Badge>
        </dd>
      </div>
    </dl>
  );
}
