import type { ParsedPriceList } from "@/services/soundtube/price-list";

/** Qué hojas del Excel se leyeron (y cuáles se saltearon y por qué). */
export function PriceListSheets({ sheets }: { sheets?: ParsedPriceList["sheets"] }) {
  if (!sheets || sheets.length < 2) return null;
  return (
    <div className="rounded-md border border-border bg-secondary/40 p-3 text-xs">
      <p className="mb-1 font-medium">El Excel tiene {sheets.length} hojas:</p>
      <ul className="space-y-0.5">
        {sheets.map((s) => (
          <li key={s.name} className={s.skipped ? "text-muted-foreground" : ""}>
            <span className="font-medium">{s.name}</span>: {s.skipped ? `salteada (${s.skipped})` : `${s.rows} filas con precio`}
          </li>
        ))}
      </ul>
    </div>
  );
}
