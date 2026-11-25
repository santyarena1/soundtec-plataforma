import { test } from "node:test";
import assert from "node:assert/strict";
import { orphanedByDeletion, pendingChangeLabel, pendingForRule, pendingRuleReviews, ruleEditKey } from "./pending";

const save = (form: Array<[string, string]>, kind: "margin" | "discount" = "margin") => ({ type: "rule.save", kind, form });
const review = (id: string, operation: unknown, minute: number, title = `rev ${id}`) => ({
  id,
  title,
  operation,
  createdAt: new Date(Date.UTC(2026, 10, 25, 12, minute)),
});

test("edición de una regla: queda marcada esa regla con «cambio pendiente»", () => {
  const pending = pendingRuleReviews("margin", [review("r1", save([["id", "rule-a"], ["percent", "2"]]), 1)]);
  assert.deepEqual(pending.byRule["rule-a"], { reviewId: "r1", change: "edit" });
  assert.equal(pending.newRules.length, 0);
});

test("«Editar todo» marca el grupo; un alta nueva va a la lista de reglas nuevas", () => {
  const pending = pendingRuleReviews("margin", [
    review("g", save([["id", "rule-a"], ["groupId", "grp_1"], ["replaceGroup", "on"]]), 1),
    review("n", save([["target", "BRAND"], ["scopeIds", "b1"]]), 2, "Nueva regla de margen: markup ×1.5"),
  ]);
  assert.equal(pending.byGroup.grp_1?.reviewId, "g");
  assert.equal(pending.byRule["rule-a"], undefined);
  assert.deepEqual(pending.newRules.map((r) => [r.reviewId, r.title]), [["n", "Nueva regla de margen: markup ×1.5"]]);
});

test("activar/desactivar y borrar marcan cada id; la revisión más nueva gana", () => {
  const pending = pendingRuleReviews("margin", [
    review("del", { type: "rules.delete", kind: "margin", ids: ["a"] }, 5),
    review("off", { type: "rules.update", kind: "margin", ids: ["a", "b"], data: { isActive: false } }, 1),
    review("val", { type: "rules.update", kind: "margin", ids: ["c"], data: { markupMultiplier: 2, marginPercent: 100 } }, 2),
  ]);
  assert.equal(pending.byRule.a?.change, "delete");
  assert.deepEqual(pending.byRule.b, { reviewId: "off", change: "toggle", active: false });
  assert.equal(pending.byRule.c?.change, "update");
});

test("solo cuenta la clase pedida y operaciones de reglas", () => {
  const pending = pendingRuleReviews("discount", [
    review("m", save([["id", "x"]], "margin"), 1),
    review("cat", { type: "products.setCategory", productIds: ["p"], categoryId: "c" }, 2),
    review("basura", { foo: 1 }, 3),
    review("d", save([["id", "y"]], "discount"), 4),
  ]);
  assert.deepEqual(Object.keys(pending.byRule), ["y"]);
});

test("pendingForRule usa el de la regla o, si no hay, el de su grupo", () => {
  const pending = pendingRuleReviews("margin", [review("g", save([["id", "a"], ["groupId", "grp"], ["replaceGroup", "on"]]), 1)]);
  assert.equal(pendingForRule(pending, { id: "b", groupId: "grp" })?.reviewId, "g");
  assert.equal(pendingForRule(pending, { id: "b", groupId: null }), null);
});

test("textos del chip", () => {
  assert.equal(pendingChangeLabel({ reviewId: "r", change: "delete" }), "Borrado pendiente de revisión");
  assert.equal(pendingChangeLabel({ reviewId: "r", change: "toggle", active: false }), "Desactivación pendiente de revisión");
  assert.equal(pendingChangeLabel({ reviewId: "r", change: "toggle", active: true }), "Activación pendiente de revisión");
  assert.equal(pendingChangeLabel({ reviewId: "r", change: "edit" }), "Cambio pendiente de revisión");
});

test("ruleEditKey: dos ediciones de la misma regla tienen la misma clave; altas y otras operaciones no", () => {
  assert.equal(ruleEditKey(save([["id", "a"], ["percent", "2"]])), "margin:rule:a");
  assert.equal(ruleEditKey(save([["id", "a"], ["percent", "3"]])), "margin:rule:a");
  assert.equal(ruleEditKey(save([["id", "a"], ["groupId", "g"], ["replaceGroup", "on"]])), "margin:group:g");
  assert.equal(ruleEditKey(save([["id", "a"]], "discount")), "discount:rule:a");
  assert.equal(ruleEditKey(save([["target", "ALL"]])), null);
  assert.equal(ruleEditKey({ type: "rules.delete", kind: "margin", ids: ["a"] }), null);
});

test("al borrar reglas, las revisiones que solo las tocaban quedan huérfanas", () => {
  const deleted = new Set(["a", "b"]);
  assert.equal(orphanedByDeletion(save([["id", "a"]]), "margin", deleted), true);
  assert.equal(orphanedByDeletion({ type: "rules.update", kind: "margin", ids: ["a", "b"], data: { isActive: false } }, "margin", deleted), true);
  // Toca además otra regla que sigue existiendo: no se descarta.
  assert.equal(orphanedByDeletion({ type: "rules.update", kind: "margin", ids: ["a", "c"], data: { isActive: false } }, "margin", deleted), false);
  // Otra clase, un grupo entero o un alta: no.
  assert.equal(orphanedByDeletion(save([["id", "a"]], "discount"), "margin", deleted), false);
  assert.equal(orphanedByDeletion(save([["id", "a"], ["groupId", "g"], ["replaceGroup", "on"]]), "margin", deleted), false);
  assert.equal(orphanedByDeletion(save([["target", "ALL"]]), "margin", deleted), false);
});
