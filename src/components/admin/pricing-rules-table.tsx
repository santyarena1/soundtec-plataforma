"use client";

import { memo, useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Clock3 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { RULES_PAGE_SIZE, pageEntries } from "@/lib/rule-table-filter";
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
import {
  EMPTY_PENDING,
  pendingChangeLabel,
  pendingForRule,
  type PendingRuleReview,
  type PendingRuleReviews,
} from "@/lib/price-review/pending";

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

/** Una regla suelta (ids) o un grupo entero (groupId), para quitar o activar/desactivar. */
export type RuleTargetRef = { ids?: string[]; groupId?: string; label: string };

/**
 * Acciones de las filas. Tienen que ser estables (useCallback en la pantalla):
 * las filas están memorizadas y así tocar «Editar» repinta 2 filas y no las ~600.
 */
type RowCallbacks = {
  onEdit: (row: PricingRuleRow) => void;
  onRemove: (target: RuleTargetRef) => void;
  onToggle: (target: RuleTargetRef, active: boolean) => void;
};

function ValueCell({ kind, row }: { kind: "margin" | "discount"; row: PricingRuleRow }) {
  const asMarkup = kind === "margin" && row.markupMultiplier != null && row.markupMultiplier > 0;
  if (kind !== "margin") {
    return <span className="font-semibold tabular-nums">-{formatMarginPercent(row.percent)}</span>;
  }
  if (asMarkup) {
    const markup = row.markupMultiplier!;
    return (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold tabular-nums">{formatMarkup(markup)}</span>
        <span className="text-xs text-muted-foreground">
          costo 100 → {listFromCost100("markup", markup).toLocaleString("es-AR", { maximumFractionDigits: 2 })}
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

/** «Pendiente de revisión» con enlace a la revisión: el cambio se pidió pero todavía no se aplicó. */
export function PendingReviewChip({ entry }: { entry: PendingRuleReview }) {
  return (
    <Link
      href={`/admin/price-reviews/${entry.reviewId}`}
      data-unsaved-guard="ignore"
      title="Todavía no se aplicó: abrí la revisión para ver qué precios mueve y aplicarlo o descartarlo."
      className="mt-1 inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-900 hover:bg-amber-100"
    >
      <Clock3 className="h-3 w-3" />
      {pendingChangeLabel(entry)}
    </Link>
  );
}

function StatusBadge({ rows }: { rows: PricingRuleRow[] }) {
  const active = rows.filter((row) => row.isActive).length;
  if (active === rows.length) return <Badge tone="success">Activa</Badge>;
  if (active === 0) return <Badge tone="muted">Inactiva</Badge>;
  return <Badge tone="warning">Mixta ({active} de {rows.length} activas)</Badge>;
}

function RowButtons({
  target,
  editLabel,
  removeLabel,
  allActive,
  busy,
  onEdit,
  onRemove,
  onToggle,
}: {
  target: RuleTargetRef;
  editLabel: string;
  removeLabel: string;
  allActive: boolean;
  busy: boolean;
  onEdit: () => void;
  onRemove: (target: RuleTargetRef) => void;
  onToggle: (target: RuleTargetRef, active: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-1">
      <Button variant="ghost" size="sm" type="button" onClick={onEdit} disabled={busy}>
        {editLabel}
      </Button>
      <Button variant="ghost" size="sm" type="button" onClick={() => onToggle(target, !allActive)} disabled={busy}>
        {allActive ? "Desactivar" : "Activar"}
      </Button>
      <Button variant="ghost" size="sm" type="button" className="text-destructive" onClick={() => onRemove(target)} disabled={busy}>
        {removeLabel}
      </Button>
    </div>
  );
}

/** Grupos chicos se ven abiertos; uno de cientos de subreglas arranca cerrado (era casi toda la tabla). */
const OPEN_GROUP_MAX = 8;

function valueText(kind: "margin" | "discount", row: PricingRuleRow) {
  if (kind === "discount") return `-${formatMarginPercent(row.percent)}`;
  return row.markupMultiplier != null && row.markupMultiplier > 0 ? formatMarkup(row.markupMultiplier) : `margen ${formatMarginPercent(row.percent)}`;
}

function ruleLabel(row: PricingRuleRow) {
  return describeRuleAppliesTo({
    scopeType: row.scopeType,
    scopeId: row.scopeId,
    clientId: row.clientId,
    clientName: row.clientName,
    resourceName: row.resourceName,
  });
}

const SingleRow = memo(function SingleRow({
  row,
  kind,
  sub,
  editing,
  busy,
  pending,
  callbacks,
}: {
  row: PricingRuleRow;
  kind: "margin" | "discount";
  sub?: boolean;
  editing: boolean;
  busy: boolean;
  pending: PendingRuleReview | null;
  callbacks: RowCallbacks;
}) {
  const exclusions = describeRuleExclusions(row);
  const label = ruleLabel(row);
  return (
    <TR className={editing ? "bg-primary/5" : undefined} data-rule-id={row.id}>
      <TD className={sub ? "pl-10" : undefined}>
        <p className="font-medium leading-snug">{label}</p>
        {sub ? (
          <p className="text-[11px] text-muted-foreground">Subregla{exclusions ? ` · ${exclusions}` : ""}</p>
        ) : (
          <>
            {exclusions ? <p className="text-[11px] text-muted-foreground">{exclusions}</p> : null}
            <p className="text-[11px] text-muted-foreground">{row.name}</p>
          </>
        )}
        {pending ? <PendingReviewChip entry={pending} /> : null}
      </TD>
      <TD>
        <ValueCell kind={kind} row={row} />
      </TD>
      <TD className="text-[12px] text-muted-foreground">{formatRuleTimestamp(row.createdAt, row.updatedAt)}</TD>
      <TD>
        <StatusBadge rows={[row]} />
      </TD>
      <TD className="text-right">
        <RowButtons
          target={{ ids: [row.id], label }}
          editLabel={editing ? "Editando" : sub ? "Editar esta" : "Editar"}
          removeLabel="Quitar"
          allActive={row.isActive}
          busy={busy}
          onEdit={() => callbacks.onEdit(row)}
          onRemove={callbacks.onRemove}
          onToggle={callbacks.onToggle}
        />
      </TD>
    </TR>
  );
});

export function PricingRulesTable({
  kind,
  rows,
  empty,
  pending = EMPTY_PENDING,
  busyKey = null,
  editingId,
  editingGroupId,
  onEdit,
  onEditGroup,
  onRemove,
  onToggle,
  recentSince,
}: {
  kind: "margin" | "discount";
  rows: PricingRuleRow[];
  empty: string;
  /** Las reglas editadas desde este momento (ms) se muestran siempre, aunque caigan fuera de la primera tanda. */
  recentSince?: number;
  pending?: PendingRuleReviews;
  busyKey?: string | null;
  editingId?: string | null;
  editingGroupId?: string | null;
  onEdit: (row: PricingRuleRow) => void;
  onEditGroup: (rows: PricingRuleRow[]) => void;
  onRemove: (target: RuleTargetRef) => void;
  onToggle: (target: RuleTargetRef, active: boolean) => void;
}) {
  const grouped = useMemo(() => groupPricingRows(rows), [rows]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(RULES_PAGE_SIZE);
  // Grupos que el usuario abrió o cerró (al revés de cómo arrancan).
  const [flippedGroups, setFlippedGroups] = useState<ReadonlySet<string>>(() => new Set());
  const searchText = useCallback(
    (entry: (typeof grouped)[number]) =>
      entry.type === "single"
        ? [ruleLabel(entry.row), entry.row.name, valueText(kind, entry.row), describeRuleExclusions(entry.row)].join(" ")
        : [describeRuleGroup(entry.rows), ...entry.rows.flatMap((row) => [ruleLabel(row), row.name, valueText(kind, row)])].join(" "),
    [kind]
  );
  const pinned = useCallback(
    (entry: (typeof grouped)[number]) => {
      const members = entry.type === "single" ? [entry.row] : entry.rows;
      if (entry.type === "group" && (entry.groupId === editingGroupId || pending.byGroup[entry.groupId])) return true;
      return members.some(
        (row) =>
          row.id === editingId ||
          Boolean(pending.byRule[row.id]) ||
          (recentSince !== undefined && new Date(row.updatedAt).getTime() >= recentSince)
      );
    },
    [editingId, editingGroupId, pending, recentSince]
  );
  const page = useMemo(() => pageEntries(grouped, searchText, query, limit, pinned), [grouped, searchText, query, limit, pinned]);
  const callbacks = useMemo<RowCallbacks>(() => ({ onEdit, onRemove, onToggle }), [onEdit, onRemove, onToggle]);
  const toggleOpen = useCallback((groupId: string) => {
    setFlippedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  return (
    <div className="space-y-3">
      {pending.newRules.length ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" data-testid="pending-new-rules">
          <p className="font-medium">
            {pending.newRules.length === 1
              ? "1 regla nueva espera revisión (todavía no aplica):"
              : `${pending.newRules.length} reglas nuevas esperan revisión (todavía no aplican):`}
          </p>
          <ul className="mt-1 space-y-0.5">
            {pending.newRules.slice(0, 8).map((entry) => (
              <li key={entry.reviewId}>
                <Link href={`/admin/price-reviews/${entry.reviewId}`} className="underline underline-offset-2" data-unsaved-guard="ignore">
                  {entry.title}
                </Link>
              </li>
            ))}
          </ul>
          {pending.newRules.length > 8 ? (
            <Link href="/admin/price-reviews" className="mt-1 inline-block text-xs underline">
              Ver las {pending.newRules.length}
            </Link>
          ) : null}
        </div>
      ) : null}

      {rows.length > RULES_PAGE_SIZE ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(RULES_PAGE_SIZE);
            }}
            placeholder="Buscar regla: marca, rubro, cliente, producto, nombre o valor (× 2,75)…"
            aria-label="Buscar regla"
            className="h-9 max-w-md"
          />
          <span className="text-xs text-muted-foreground">
            {query.trim() ? `${page.matched} de ${grouped.length}` : `${grouped.length} reglas y grupos`}
          </span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <TableEmpty message={empty} />
      ) : page.matched === 0 ? (
        <TableEmpty message="Ninguna regla coincide con la búsqueda." />
      ) : (
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
            {page.shown.map((entry) => {
              if (entry.type === "single") {
                const row = entry.row;
                return (
                  <SingleRow
                    key={row.id}
                    row={row}
                    kind={kind}
                    editing={editingId === row.id}
                    busy={busyKey === row.id}
                    pending={pending.byRule[row.id] ?? null}
                    callbacks={callbacks}
                  />
                );
              }
              const inGroup = (id: string | null | undefined) => Boolean(id) && entry.rows.some((row) => row.id === id);
              return (
                <GroupBlock
                  key={entry.groupId}
                  kind={kind}
                  groupId={entry.groupId}
                  members={entry.rows}
                  expanded={(entry.rows.length <= OPEN_GROUP_MAX) !== flippedGroups.has(entry.groupId)}
                  editingGroup={editingGroupId === entry.groupId}
                  editingId={inGroup(editingId) ? editingId! : null}
                  busyKey={busyKey === entry.groupId || inGroup(busyKey) ? busyKey : null}
                  pending={pending}
                  callbacks={callbacks}
                  onToggleOpen={toggleOpen}
                  onEditGroup={onEditGroup}
                />
              );
            })}
          </TBody>
        </Table>
      )}
      {page.hasMore ? (
        <div className="flex flex-wrap items-center justify-center gap-2 text-sm">
          <span className="text-muted-foreground">
            Mostrando {page.shown.length} de {page.matched}
          </span>
          <Button type="button" variant="outline" size="sm" onClick={() => setLimit((n) => n + RULES_PAGE_SIZE)}>
            Mostrar {Math.min(RULES_PAGE_SIZE, page.matched - page.shown.length)} más
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setLimit(page.matched)}>
            Mostrar todas
          </Button>
        </div>
      ) : null}
    </div>
  );
}

const GroupBlock = memo(function GroupBlock({
  kind,
  groupId,
  members,
  expanded,
  editingGroup,
  editingId,
  busyKey,
  pending,
  callbacks,
  onToggleOpen,
  onEditGroup,
}: {
  kind: "margin" | "discount";
  groupId: string;
  members: PricingRuleRow[];
  expanded: boolean;
  editingGroup: boolean;
  editingId: string | null;
  busyKey: string | null;
  pending: PendingRuleReviews;
  callbacks: RowCallbacks;
  onToggleOpen: (groupId: string) => void;
  onEditGroup: (rows: PricingRuleRow[]) => void;
}) {
  const first = members[0];
  const mixed = members.some((row) => row.percent !== first.percent || row.markupMultiplier !== first.markupMultiplier);
  const memberEntries = members.map((row) => pendingForRule(pending, row));
  const membersPending = memberEntries.some(Boolean);
  // Un mismo cambio para todo el grupo (activar/desactivar o quitar el grupo) se muestra en el encabezado.
  const sharedEntry =
    memberEntries[0] && memberEntries.every((entry) => entry?.reviewId === memberEntries[0]!.reviewId) ? memberEntries[0] : null;
  const groupPending = pending.byGroup[groupId] ?? sharedEntry;
  const label = describeRuleGroup(members);
  return (
    <>
      <TR className={editingGroup ? "bg-primary/5" : "bg-secondary/30"} data-group-id={groupId}>
        <TD>
          <button type="button" className="flex items-start gap-2 text-left" onClick={() => onToggleOpen(groupId)} aria-expanded={expanded}>
            <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 transition ${expanded ? "" : "-rotate-90"}`} />
            <span>
              <span className="font-medium leading-snug">{label}</span>
              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                {members.length} subreglas{mixed ? " · hay valores distintos" : ""}
                {describeRuleExclusions(first) ? ` · ${describeRuleExclusions(first)}` : ""}
              </span>
            </span>
          </button>
          {groupPending ? (
            <PendingReviewChip entry={groupPending} />
          ) : !expanded && membersPending ? (
            <p className="mt-1 text-[11px] text-amber-800">Hay subreglas con cambios pendientes de revisión.</p>
          ) : null}
        </TD>
        <TD>{mixed ? <span className="text-xs text-muted-foreground">Varios valores</span> : <ValueCell kind={kind} row={first} />}</TD>
        <TD className="text-[12px] text-muted-foreground">{formatRuleTimestamp(first.createdAt, first.updatedAt)}</TD>
        <TD>
          <StatusBadge rows={members} />
        </TD>
        <TD className="text-right">
          <RowButtons
            target={{ groupId, label }}
            editLabel={editingGroup ? "Editando grupo" : "Editar todo"}
            removeLabel="Quitar grupo"
            allActive={members.every((row) => row.isActive)}
            busy={busyKey === groupId}
            onEdit={() => onEditGroup(members)}
            onRemove={callbacks.onRemove}
            onToggle={callbacks.onToggle}
          />
        </TD>
      </TR>
      {expanded
        ? members.map((row) => (
            <SingleRow
              key={row.id}
              row={row}
              kind={kind}
              sub
              editing={editingId === row.id}
              busy={busyKey === row.id}
              pending={pending.byRule[row.id] ?? null}
              callbacks={callbacks}
            />
          ))
        : null}
    </>
  );
});
