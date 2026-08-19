"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import {
  describeRuleAppliesTo,
  describeRuleExclusions,
  describeRuleGroup,
  formatMarginPercent,
  formatMarkup,
  formatRuleTimestamp,
  groupPricingRows,
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
  markupMultiplier: number | null;
  groupId: string | null;
  isExemption: boolean;
  excludedProductIds: string[];
  excludedProductLabels: string[];
  createdAt: string;
  updatedAt: string;
  members?: PricingRuleRow[];
};

function ValueCell({ kind, row }: { kind: "margin" | "discount"; row: PricingRuleRow }) {
  const asMarkup = kind === "margin" && row.markupMultiplier != null && row.markupMultiplier > 0;
  const markup = asMarkup ? row.markupMultiplier! : null;
  if (kind !== "margin") {
    return <span className="font-semibold tabular-nums">-{formatMarginPercent(row.percent)}</span>;
  }
  if (asMarkup) {
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold tabular-nums">{formatMarkup(markup!)}</span>
        <span className="text-xs text-muted-foreground">
          costo 100 → {listFromCost100("markup", markup!).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-semibold tabular-nums">Margen {formatMarginPercent(row.percent)}</span>
      <span className="text-xs text-muted-foreground">
        {formatMarkup(1 + row.percent / 100)} · costo 100 →{" "}
        {listFromCost100("margin", row.percent).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
      </span>
    </div>
  );
}

export function PricingRulesTable({
  kind,
  rows,
  empty,
  deleteAction,
  deleteGroupAction,
  editingId,
  editingGroupId,
  onEdit,
  onEditGroup,
}: {
  kind: "margin" | "discount";
  rows: PricingRuleRow[];
  empty: string;
  deleteAction: (formData: FormData) => void | Promise<void>;
  deleteGroupAction: (formData: FormData) => void | Promise<void>;
  editingId?: string | null;
  editingGroupId?: string | null;
  onEdit: (row: PricingRuleRow) => void;
  onEditGroup: (rows: PricingRuleRow[]) => void;
}) {
  const grouped = useMemo(() => groupPricingRows(rows), [rows]);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});

  if (rows.length === 0) {
    return <TableEmpty message={empty} />;
  }

  function isOpen(groupId: string) {
    return openGroups[groupId] ?? true;
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
        {grouped.map((entry) => {
          if (entry.type === "single") {
            const row = entry.row;
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
                  {describeRuleExclusions(row) ? (
                    <p className="text-[11px] text-muted-foreground">{describeRuleExclusions(row)}</p>
                  ) : null}
                  <p className="text-[11px] text-muted-foreground">{row.name}</p>
                </TD>
                <TD>
                  <ValueCell kind={kind} row={row} />
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
          }

          const members = entry.rows;
          const first = members[0];
          const mixed = members.some(
            (row) => row.percent !== first.percent || row.markupMultiplier !== first.markupMultiplier
          );
          const editingGroup = editingGroupId === entry.groupId;
          const expanded = isOpen(entry.groupId);
          return (
            <GroupBlock
              key={entry.groupId}
              kind={kind}
              groupId={entry.groupId}
              members={members}
              mixed={mixed}
              expanded={expanded}
              editingGroup={editingGroup}
              editingId={editingId}
              onToggle={() => setOpenGroups((prev) => ({ ...prev, [entry.groupId]: !expanded }))}
              onEdit={onEdit}
              onEditGroup={onEditGroup}
              deleteAction={deleteAction}
              deleteGroupAction={deleteGroupAction}
            />
          );
        })}
      </TBody>
    </Table>
  );
}

function GroupBlock({
  kind,
  groupId,
  members,
  mixed,
  expanded,
  editingGroup,
  editingId,
  onToggle,
  onEdit,
  onEditGroup,
  deleteAction,
  deleteGroupAction,
}: {
  kind: "margin" | "discount";
  groupId: string;
  members: PricingRuleRow[];
  mixed: boolean;
  expanded: boolean;
  editingGroup: boolean;
  editingId?: string | null;
  onToggle: () => void;
  onEdit: (row: PricingRuleRow) => void;
  onEditGroup: (rows: PricingRuleRow[]) => void;
  deleteAction: (formData: FormData) => void | Promise<void>;
  deleteGroupAction: (formData: FormData) => void | Promise<void>;
}) {
  const first = members[0];
  return (
    <>
      <TR className={editingGroup ? "bg-primary/5" : "bg-secondary/30"}>
        <TD>
          <button type="button" className="flex items-start gap-2 text-left" onClick={onToggle}>
            <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition ${expanded ? "" : "-rotate-90"}`} />
            <span>
              <span className="font-medium leading-snug">{describeRuleGroup(members)}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {members.length} subreglas{mixed ? " · hay valores distintos" : ""}
                {describeRuleExclusions(first) ? ` · ${describeRuleExclusions(first)}` : ""}
              </span>
            </span>
          </button>
        </TD>
        <TD>
          {mixed ? <span className="text-xs text-muted-foreground">Varios valores</span> : <ValueCell kind={kind} row={first} />}
        </TD>
        <TD className="text-[12px] text-muted-foreground">{formatRuleTimestamp(first.createdAt, first.updatedAt)}</TD>
        <TD>
          {members.every((row) => row.isActive) ? (
            <Badge tone="success">Activa</Badge>
          ) : (
            <Badge tone="muted">Mixta</Badge>
          )}
        </TD>
        <TD className="text-right">
          <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="sm" type="button" onClick={() => onEditGroup(members)}>
              {editingGroup ? "Editando grupo" : "Editar todo"}
            </Button>
            <form action={deleteGroupAction} className="inline">
              <input type="hidden" name="groupId" value={groupId} />
              <Button variant="ghost" size="sm" type="submit" className="text-destructive">
                Quitar grupo
              </Button>
            </form>
          </div>
        </TD>
      </TR>
      {expanded
        ? members.map((row) => {
            const editing = editingId === row.id;
            return (
              <TR key={row.id} className={editing ? "bg-primary/5" : undefined}>
                <TD className="pl-10">
                  <p className="font-medium leading-snug">
                    {describeRuleAppliesTo({
                      scopeType: row.scopeType,
                      scopeId: row.scopeId,
                      clientId: row.clientId,
                      clientName: row.clientName,
                      resourceName: row.resourceName,
                    })}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Subregla
                    {describeRuleExclusions(row) ? ` · ${describeRuleExclusions(row)}` : ""}
                  </p>
                </TD>
                <TD>
                  <ValueCell kind={kind} row={row} />
                </TD>
                <TD className="text-[12px] text-muted-foreground">{formatRuleTimestamp(row.createdAt, row.updatedAt)}</TD>
                <TD>{row.isActive ? <Badge tone="success">Activa</Badge> : <Badge tone="muted">Inactiva</Badge>}</TD>
                <TD className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button variant="ghost" size="sm" type="button" onClick={() => onEdit(row)}>
                      {editing ? "Editando" : "Editar esta"}
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
          })
        : null}
    </>
  );
}
