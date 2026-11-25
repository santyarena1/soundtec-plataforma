/**
 * Qué reglas tienen un cambio esperando en «Revisión de cambios». Lo usa la
 * tabla de Márgenes/Descuentos para marcar cada regla con «pendiente de
 * revisión» y un enlace, y para listar las altas que todavía no se aplicaron.
 */
import { isPriceOperation, type RuleKind } from "./operations";

export type PendingChange = "edit" | "group" | "toggle" | "delete" | "update";

export interface PendingRuleReview {
  reviewId: string;
  change: PendingChange;
  /** Para `toggle`: a qué estado pasaría. */
  active?: boolean;
}

export interface PendingNewRule {
  reviewId: string;
  title: string;
  createdAt: string;
}

export interface PendingRuleReviews {
  byRule: Record<string, PendingRuleReview>;
  byGroup: Record<string, PendingRuleReview>;
  newRules: PendingNewRule[];
}

export interface PendingReviewInput {
  id: string;
  title: string;
  createdAt: Date | string;
  operation: unknown;
}

export const EMPTY_PENDING: PendingRuleReviews = { byRule: {}, byGroup: {}, newRules: [] };

function formValue(form: Array<[string, string]>, key: string): string {
  return form.find(([k]) => k === key)?.[1] ?? "";
}

/**
 * Agrupa las revisiones pendientes (de la más vieja a la más nueva: la última
 * gana si hay dos sobre la misma regla) por regla y por grupo.
 */
export function pendingRuleReviews(kind: RuleKind, reviews: readonly PendingReviewInput[]): PendingRuleReviews {
  const byRule: Record<string, PendingRuleReview> = {};
  const byGroup: Record<string, PendingRuleReview> = {};
  const newRules: PendingNewRule[] = [];
  const ordered = [...reviews].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  for (const review of ordered) {
    const op = review.operation;
    if (!isPriceOperation(op)) continue;
    if (op.type !== "rule.save" && op.type !== "rules.update" && op.type !== "rules.delete") continue;
    if (op.kind !== kind) continue;
    if (op.type === "rule.save") {
      const id = formValue(op.form, "id");
      const groupId = formValue(op.form, "groupId");
      const replaceGroup = formValue(op.form, "replaceGroup") === "on";
      if (replaceGroup && groupId) {
        byGroup[groupId] = { reviewId: review.id, change: "group" };
        continue;
      }
      if (id) {
        byRule[id] = { reviewId: review.id, change: "edit" };
        continue;
      }
      newRules.push({
        reviewId: review.id,
        title: review.title,
        createdAt: new Date(review.createdAt).toISOString(),
      });
      continue;
    }
    const entry: PendingRuleReview =
      op.type === "rules.delete"
        ? { reviewId: review.id, change: "delete" }
        : op.data.isActive !== undefined && Object.keys(op.data).length === 1
          ? { reviewId: review.id, change: "toggle", active: op.data.isActive }
          : { reviewId: review.id, change: "update" };
    for (const id of op.ids) byRule[id] = entry;
  }
  return { byRule, byGroup, newRules: newRules.reverse() };
}

/**
 * Clave de «qué regla edita» un alta/edición: `rule:<id>` o `group:<groupId>`.
 * Dos revisiones pendientes con la misma clave son versiones del mismo cambio:
 * la nueva reemplaza a la vieja (aplicar la vieja después pisaría lo último).
 * Altas nuevas y otras operaciones: null.
 */
export function ruleEditKey(op: unknown): string | null {
  if (!isPriceOperation(op) || op.type !== "rule.save") return null;
  const id = formValue(op.form, "id");
  const groupId = formValue(op.form, "groupId");
  if (formValue(op.form, "replaceGroup") === "on" && groupId) return `${op.kind}:group:${groupId}`;
  return id ? `${op.kind}:rule:${id}` : null;
}

/**
 * ¿Esta revisión pendiente quedó sin sentido porque sus reglas se borraron?
 * (editar, activar o borrar reglas que ya no existen). Se descartan solas al
 * aplicar el borrado, para que no queden colgadas en Revisión de cambios.
 */
export function orphanedByDeletion(op: unknown, kind: RuleKind, deletedIds: ReadonlySet<string>): boolean {
  if (!isPriceOperation(op) || deletedIds.size === 0) return false;
  if (op.type === "rule.save") {
    if (op.kind !== kind || formValue(op.form, "replaceGroup") === "on") return false;
    const id = formValue(op.form, "id");
    return Boolean(id) && deletedIds.has(id);
  }
  if (op.type === "rules.update" || op.type === "rules.delete") {
    return op.kind === kind && op.ids.length > 0 && op.ids.every((id) => deletedIds.has(id));
  }
  return false;
}

/** Texto del chip: «Edición pendiente de revisión», «Borrado pendiente…». */
export function pendingChangeLabel(entry: PendingRuleReview): string {
  switch (entry.change) {
    case "delete":
      return "Borrado pendiente de revisión";
    case "toggle":
      return entry.active ? "Activación pendiente de revisión" : "Desactivación pendiente de revisión";
    case "group":
      return "Cambio del grupo pendiente de revisión";
    default:
      return "Cambio pendiente de revisión";
  }
}

/** La revisión pendiente que toca a una regla (la propia o la de su grupo). */
export function pendingForRule(
  pending: PendingRuleReviews,
  row: { id: string; groupId: string | null }
): PendingRuleReview | null {
  return pending.byRule[row.id] ?? (row.groupId ? pending.byGroup[row.groupId] ?? null : null);
}
