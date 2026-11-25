"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs } from "@/components/ui/tabs";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { RulesForm } from "./rules-form";
import { ProductCoverageView } from "./product-coverage-view";
import { PricingRulesTable, type PricingRuleRow, type RuleTargetRef } from "@/components/admin/pricing-rules-table";
import { PriceReviewNotice, type ReviewNoticeData } from "@/components/admin/price-review-notice";
import { confirmDiscard } from "@/hooks/use-unsaved-changes-guard";
import { hasUnsavedChanges } from "@/lib/unsaved-guard/registry";
import { EMPTY_PENDING, pendingForRule, type PendingRuleReviews } from "@/lib/price-review/pending";
import { proposeRuleRemoval, proposeRulesActive } from "@/server/actions/pricing-rules";

type Named = { id: string; name: string };
type CategoryNode = import("@/lib/category-tree").CategoryNode;
type ClientOpt = { id: string; name: string; companyName?: string | null };

interface WorkspaceProps {
  kind: "margin" | "discount";
  rows: PricingRuleRow[];
  /** Cambios de reglas esperando en Revisión de cambios (chip «pendiente de revisión»). */
  pending?: PendingRuleReviews;
  empty: string;
  clients: ClientOpt[];
  brands: Named[];
  distributors: Named[];
  /** Árbol de rubros. Vacío = el formulario lo pide al elegir «Rubro(s)». */
  categories?: CategoryNode[];
  families: Named[];
  lines?: Named[];
  products: { id: string; normalizedName: string }[];
  lockedClientId?: string;
  /** Marca de cuándo el servidor armó la pantalla (para refrescar al volver con «atrás»). */
  renderedAt?: number;
}

/**
 * Renders del servidor ya mostrados. Con «atrás» Next vuelve a montar la pantalla
 * con la copia guardada (la tabla de antes de aplicar un cambio): si la marca ya
 * se vio, es una copia vieja y se pide la actual.
 */
const seenRenders = new Set<number>();
const NO_CATEGORIES: CategoryNode[] = [];

/** Reglas guardadas en los últimos 15 minutos: siempre a la vista en la tabla (aunque haya cientos). */
const RECENT_RULE_MS = 15 * 60_000;

/** Cambiar de regla o cancelar con la actual a medio editar pide confirmación. */
function canDiscard() {
  return confirmDiscard(hasUnsavedChanges(), "Tenés cambios sin guardar en la regla que estás editando. ¿Descartarlos?");
}

function reviewToast(review: { affectedProducts: number; reused?: boolean }, what: string) {
  if (review.reused) return `${what}: ya estaba pendiente de revisión con lo mismo. No se duplicó.`;
  return review.affectedProducts === 0
    ? `${what}: no mueve ningún precio. Aplicalo con un clic en el aviso.`
    : `${what}: mueve el precio de ${review.affectedProducts} producto${review.affectedProducts === 1 ? "" : "s"}. Quedó en Revisión de cambios.`;
}

export function PricingRulesWorkspace(props: WorkspaceProps) {
  const { kind, rows, empty, lockedClientId } = props;
  const categories = props.categories ?? NO_CATEGORIES;
  const pending = props.pending ?? EMPTY_PENDING;
  const router = useRouter();
  const params = useSearchParams();
  const [editing, setEditing] = useState<PricingRuleRow | null>(null);
  const [editMode, setEditMode] = useState<"one" | "group">("one");
  const [notice, setNotice] = useState<ReviewNoticeData | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const checkedRender = useRef(false);
  const coverageClients = useMemo(() => props.clients.map((x) => ({ id: x.id, name: x.companyName || x.name })), [props.clients]);

  useEffect(() => {
    const renderedAt = props.renderedAt;
    if (renderedAt === undefined || checkedRender.current) return;
    checkedRender.current = true;
    if (seenRenders.has(renderedAt)) router.refresh();
    else seenRenders.add(renderedAt);
  }, [props.renderedAt, router]);

  // Estables (useCallback): la tabla tiene las filas memorizadas y no se repinta entera al tocar «Editar».
  const startEditOne = useCallback(async (row: PricingRuleRow) => {
    if (!(await canDiscard())) return;
    setEditing({ ...row, members: undefined });
    setEditMode("one");
  }, []);
  const startEditGroup = useCallback(async (members: PricingRuleRow[]) => {
    if (!members[0] || !(await canDiscard())) return;
    setEditing({ ...members[0], members });
    setEditMode("group");
  }, []);
  const clearEdit = useCallback(() => {
    setEditing(null);
    setEditMode("one");
  }, []);
  const cancelEdit = useCallback(async () => {
    if (await canDiscard()) clearEdit();
  }, [clearEdit]);

  /** Un cambio quedó en revisión: aviso arriba del formulario y la tabla marca la regla como pendiente. */
  const showReview = useCallback(
    (next: ReviewNoticeData) => {
      setNotice(next);
      router.refresh();
    },
    [router]
  );

  const runTableAction = useCallback(
    async (key: string, what: string, action: () => ReturnType<typeof proposeRuleRemoval>) => {
      setBusyKey(key);
      try {
        const result = await action();
        if (!result.ok) {
          toast.error(result.error);
          return;
        }
        toast.message(reviewToast(result.review, what));
        showReview({ ...result.review, title: what });
      } catch {
        toast.error("No se pudo calcular el impacto. Recargá la página y probá de nuevo.");
      } finally {
        setBusyKey(null);
      }
    },
    [showReview]
  );

  const remove = useCallback(
    async (target: RuleTargetRef) => {
      const group = Boolean(target.groupId);
      const ok = await confirmDialog({
        title: group ? "Quitar grupo de reglas" : "Quitar regla",
        message: `${target.label}. No se borra todavía: se calcula qué precios se mueven y queda en Revisión de cambios para aplicarlo.`,
        confirmLabel: group ? "Calcular borrado del grupo" : "Calcular borrado",
        tone: "danger",
      });
      if (!ok) return;
      await runTableAction(target.groupId || target.ids?.[0] || "", group ? "Quitar grupo" : "Quitar regla", () =>
        proposeRuleRemoval({ kind, ids: target.ids, groupId: target.groupId })
      );
    },
    [kind, runTableAction]
  );

  const toggle = useCallback(
    async (target: RuleTargetRef, active: boolean) => {
      await runTableAction(target.groupId || target.ids?.[0] || "", active ? "Activar" : "Desactivar", () =>
        proposeRulesActive({ kind, ids: target.ids, groupId: target.groupId, active })
      );
    },
    [kind, runTableAction]
  );

  const noun = kind === "margin" ? "regla de precio" : "descuento";
  const heading =
    editing && editMode === "group"
      ? `Editar ${noun} (todas las subreglas)`
      : editing
        ? editing.groupId
          ? "Editar subregla"
          : `Editar ${noun}`
        : kind === "margin"
          ? "Nueva regla de precio"
          : "Nueva regla de descuento";
  const subheading = editing
    ? editMode === "group"
      ? "Los cambios se aplican a todo el grupo. Previsualizá para exceptuar productos."
      : editing.groupId
        ? "Sólo se actualiza esta subregla."
        : "Cambiá los campos y guardá."
    : null;
  const editingPending = editing
    ? editMode === "group" && editing.groupId
      ? pending.byGroup[editing.groupId] ?? null
      : pendingForRule(pending, editing)
    : null;
  const formKey = editing ? (editMode === "group" ? `group-${editing.groupId || editing.id}` : editing.id) : "new";

  const rulesView = (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-5 p-6">
          <div className="border-b border-border pb-4">
            <h2 className="heading-3">{heading}</h2>
            {subheading ? <p className="mt-1 text-sm text-muted-foreground">{subheading}</p> : null}
          </div>
          {notice ? <PriceReviewNotice notice={notice} onDone={() => setNotice(null)} onDismiss={() => setNotice(null)} /> : null}
          <RulesForm
            key={formKey}
            type={kind}
            initial={editing}
            editingGroup={editMode === "group"}
            pendingReview={editingPending}
            onSaved={clearEdit}
            onCancel={cancelEdit}
            onReview={showReview}
            lockedClientId={lockedClientId}
            clients={props.clients}
            brands={props.brands}
            distributors={props.distributors}
            categories={categories}
            families={props.families}
            lines={props.lines}
            products={props.products}
          />
        </CardContent>
      </Card>
      <PricingRulesTable
        kind={kind}
        rows={rows}
        empty={empty}
        pending={pending}
        busyKey={busyKey}
        editingId={editMode === "one" ? editing?.id : undefined}
        editingGroupId={editMode === "group" ? editing?.groupId : undefined}
        onEdit={startEditOne}
        onEditGroup={startEditGroup}
        onRemove={remove}
        onToggle={toggle}
        recentSince={props.renderedAt !== undefined ? props.renderedAt - RECENT_RULE_MS : undefined}
      />
    </div>
  );
  if (lockedClientId) return rulesView;
  return (
    <Tabs
      defaultTab={params.get("view") === "products" ? "products" : "rules"}
      syncParam="view"
      lazy
      shallow
      tabs={[
        { id: "rules", label: "Reglas", content: rulesView },
        {
          id: "products",
          label: "Por producto",
          content: (
            <ProductCoverageView
              kind={kind}
              clients={coverageClients}
              brands={props.brands}
              distributors={props.distributors}
              categories={categories}
              families={props.families}
              products={props.products}
            />
          ),
        },
      ]}
    />
  );
}
