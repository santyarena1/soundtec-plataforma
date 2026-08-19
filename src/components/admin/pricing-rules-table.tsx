"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import {
  describeRuleAppliesTo,
  formatMarginPercent,
  formatMarkup,
  formatRuleTimestamp,
  listFromCost100,
} from "@/lib/pricing-scope";

export type PricingRuleRow = {
  id: string;
  name: string;
  scopeType: string;
  scopeId: string | null;
  clientId: string | null;
  clientName: string | null;
  resourceName: string | null;
  isActive: boolean;
  percent: number;
  markupMultiplier?: number | null;
  createdAt: string;
  updatedAt: string;
};

export function PricingRulesTable({
  kind,
  rows,
  empty,
  deleteAction,
  editingId,
  onEdit,
}: {
  kind: "margin" | "discount";
  rows: PricingRuleRow[];
  empty: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  editingId?: string | null;
  onEdit: (row: PricingRuleRow) => void;
}) {
  if (rows.length === 0) {
    return <TableEmpty message={empty} />;
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH>Aplica a</TH>
          <TH>{kind === "margin" ? "Valor" : "Descuento"}</TH>
          <TH>Alta</TH>
          <TH>Estado</TH>
          <TH></TH>
        </TR>
      </THead>
      <TBody>
        {rows.map((row) => {
          const asMarkup = kind === "margin" && row.markupMultiplier != null && row.markupMultiplier > 0;
          const markup = asMarkup ? row.markupMultiplier! : null;
          const editing = editingId === row.id;
          return (
            <TR key={row.id} className={editing ? "bg-primary/5" : undefined}>
              <TD>
                <p className="font-medium leading-snug">
                  {describeRuleAppliesTo({
                    scopeType: row.scopeType,
                    scopeId: row.scopeId,
                    clientId: row.clientId,
                    clientName: row.clientName,
                    resourceName: row.resourceName,
                  })}
                </p>
                <p className="text-[11px] text-muted-foreground">{row.name}</p>
              </TD>
              <TD>
                {kind === "margin" ? (
                  <div className="text-sm">
                    {asMarkup ? (
                      <>
                        <span className="font-semibold tabular-nums">{formatMarkup(markup!)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          costo 100 → {listFromCost100("markup", markup!).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="font-semibold tabular-nums">Margen {formatMarginPercent(row.percent)}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {formatMarkup(1 + row.percent / 100)} · costo 100 →{" "}
                          {listFromCost100("margin", row.percent).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
                        </span>
                      </>
                    )}
                  </div>
                ) : (
                  <span className="font-semibold tabular-nums">-{formatMarginPercent(row.percent)}</span>
                )}
              </TD>
              <TD className="text-[12px] text-muted-foreground">{formatRuleTimestamp(row.createdAt, row.updatedAt)}</TD>
              <TD>{row.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}</TD>
              <TD className="text-right">
                <div className="flex items-center justify-end gap-1">
                  <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(row)}>
                    {editing ? "Editando" : "Editar"}
                  </Button>
                  <form action={deleteAction} className="inline">
                    <input type="hidden" name="id" value={row.id} />
                    <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                      Quitar
                    </Button>
                  </form>
                </div>
              </TD>
            </TR>
          );
        })}
      </TBody>
    </Table>
  );
}
