"use client";

import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { SCOPE_LABEL, formatRuleTimestamp } from "@/lib/pricing-scope";

export type VisibilityRuleRow = {
  id: string;
  clientId: string;
  clientName: string;
  scopeType: string;
  scopeId: string | null;
  resourceName: string | null;
  canView: boolean;
  createdAt: string;
  updatedAt: string;
};

export function VisibilityRulesTable({
  rows,
  empty,
  deleteAction,
  toggleAction,
  editingId,
  onEdit,
}: {
  rows: VisibilityRuleRow[];
  empty?: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  toggleAction: (formData: FormData) => void | Promise<void>;
  editingId?: string | null;
  onEdit: (row: VisibilityRuleRow) => void;
}) {
  const groups = useMemo(() => {
    const map = new Map<string, { clientId: string; clientName: string; items: VisibilityRuleRow[] }>();
    for (const row of rows) {
      const current = map.get(row.clientId);
      if (current) {
        current.items.push(row);
      } else {
        map.set(row.clientId, { clientId: row.clientId, clientName: row.clientName, items: [row] });
      }
    }
    return [...map.values()];
  }, [rows]);

  if (rows.length === 0) {
    return <TableEmpty message={empty || "Todavía no hay excepciones de visibilidad."} />;
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.clientId}>
          <h3 className="mb-2 text-sm font-semibold">{group.clientName}</h3>
          <Table>
            <THead>
              <TR>
                <TH>Recurso</TH>
                <TH>Acceso</TH>
                <TH>Alta</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {group.items.map((row) => {
                const editing = editingId === row.id;
                return (
                  <TR key={row.id} className={editing ? "bg-primary/5" : undefined}>
                    <TD>
                      <p className="font-medium">
                        {SCOPE_LABEL[row.scopeType] || row.scopeType}
                        {row.resourceName ? `: ${row.resourceName}` : ""}
                      </p>
                    </TD>
                    <TD>
                      {row.canView ? <Badge tone="success">Permitido</Badge> : <Badge tone="destructive">Oculto</Badge>}
                    </TD>
                    <TD className="text-[12px] text-muted-foreground">
                      {formatRuleTimestamp(row.createdAt, row.updatedAt)}
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(row)}>
                          {editing ? "Editando" : "Editar"}
                        </Button>
                        <form action={toggleAction} className="inline">
                          <input type="hidden" name="id" value={row.id} />
                          <Button variant="ghost" size="sm" type="submit">
                            {row.canView ? "Ocultar" : "Permitir"}
                          </Button>
                        </form>
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
        </div>
      ))}
    </div>
  );
}
