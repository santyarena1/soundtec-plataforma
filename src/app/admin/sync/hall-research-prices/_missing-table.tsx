"use client";

import { Table, TBody, TD, TH, THead, TR, TableEmpty } from "@/components/ui/table";
import type { HallPreviewMissing } from "@/server/actions/hall-research-price-list";

export type MissingAction = "keep" | "deactivate" | "price";

export interface MissingChoice {
  action: MissingAction;
  costUsd: string;
}

interface MissingTableProps {
  rows: HallPreviewMissing[];
  choices: Record<string, MissingChoice>;
  onChange: (productId: string, choice: MissingChoice) => void;
  onBulk: (action: MissingAction) => void;
}

const usd = (value: number) => `USD ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Productos de las marcas Hall Research que la lista nueva ya no trae: el admin decide qué hacer con cada uno. */
export function MissingTable({ rows, choices, onChange, onBulk }: MissingTableProps) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className="text-muted-foreground">Para todos los activos:</span>
        <button type="button" className="font-medium text-destructive hover:underline" onClick={() => onBulk("deactivate")}>
          Desactivar
        </button>
        <button type="button" className="font-medium hover:underline" onClick={() => onBulk("keep")}>
          Dejar como están
        </button>
      </div>
      <Table>
        <THead>
          <TR>
            <TH>SKU</TH>
            <TH>Marca</TH>
            <TH>Costo actual</TH>
            <TH>Estado</TH>
            <TH>Qué hacer</TH>
          </TR>
        </THead>
        <TBody>
          {rows.length === 0 ? (
            <TableEmpty message="Todos los productos de estas marcas están en la lista." />
          ) : (
            rows.map((row) => {
              const choice = choices[row.productId] ?? { action: "keep", costUsd: "" };
              return (
                <TR key={row.productId}>
                  <TD className="font-mono text-xs font-semibold">{row.sku || "—"}</TD>
                  <TD className="text-xs text-muted-foreground">{row.brand}</TD>
                  <TD className="whitespace-nowrap text-xs">{usd(row.cost)}</TD>
                  <TD className="text-xs">{row.isActive ? "Activo" : "Inactivo"}</TD>
                  <TD>
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        aria-label={`Qué hacer con ${row.sku}`}
                        className="h-8 rounded-md border border-border bg-card px-2 text-xs"
                        value={choice.action}
                        onChange={(e) => onChange(row.productId, { ...choice, action: e.target.value as MissingAction })}
                      >
                        <option value="keep">Dejar como está</option>
                        <option value="deactivate">Desactivar</option>
                        <option value="price">Ponerle costo</option>
                      </select>
                      {choice.action === "price" && (
                        <input
                          aria-label="Costo USD"
                          inputMode="decimal"
                          placeholder="Costo USD"
                          className="h-8 w-24 rounded-md border border-border bg-card px-2 text-xs"
                          value={choice.costUsd}
                          onChange={(e) => onChange(row.productId, { ...choice, costUsd: e.target.value })}
                        />
                      )}
                    </div>
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}
