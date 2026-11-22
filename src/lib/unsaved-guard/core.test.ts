import { test } from "node:test";
import assert from "node:assert/strict";
import { autosaveNeedsWarning, isSameValue, serializeFormControls, shouldGuardLinkClick, stableSerialize, type ClickLike } from "./core";

const HERE = "https://soundtecportal.com.ar/admin/products/abc?tab=general";
const click = (over: Partial<ClickLike> = {}): ClickLike => ({ button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, defaultPrevented: false, ...over });

// ─── «Dirty»: compara contra el inicial, no contra «tocó algo» ───

test("mismo contenido con claves en otro orden no cuenta como cambio", () => {
  assert.ok(isSameValue({ a: 1, b: { c: [1, 2], d: "x" } }, { b: { d: "x", c: [1, 2] }, a: 1 }));
});

test("volver al valor original deja de ser un cambio", () => {
  const initial = { name: "Parlante", price: 100 };
  const edited = { ...initial, name: "Parlante X" };
  const reverted = { ...edited, name: "Parlante" };
  assert.ok(!isSameValue(initial, edited));
  assert.ok(isSameValue(initial, reverted));
});

test("undefined y claves ausentes son lo mismo; funciones se ignoran", () => {
  assert.ok(isSameValue({ a: 1, b: undefined }, { a: 1 }));
  assert.ok(isSameValue({ a: 1, onSave: () => 1 }, { a: 1 }));
});

test("el orden de las listas importa (reordenar es un cambio)", () => {
  assert.ok(!isSameValue(["a", "b"], ["b", "a"]));
});

test("Date, Set y Map se comparan por contenido", () => {
  assert.ok(isSameValue({ d: new Date("2026-01-01T00:00:00Z") }, { d: new Date("2026-01-01T00:00:00Z") }));
  assert.ok(isSameValue(new Set(["x", "y"]), new Set(["y", "x"])));
  assert.ok(!isSameValue(new Set(["x"]), new Set(["x", "y"])));
  assert.ok(isSameValue(new Map([["k", 1]]), new Map([["k", 1]])));
});

test("string vacío y null no son lo mismo; 0 y '0' tampoco", () => {
  assert.ok(!isSameValue({ a: "" }, { a: null }));
  assert.ok(!isSameValue({ a: 0 }, { a: "0" }));
});

test("referencias circulares no rompen", () => {
  const a: Record<string, unknown> = { x: 1 };
  a.self = a;
  assert.doesNotThrow(() => stableSerialize(a));
});

// ─── Foto de formularios ───

test("foto del formulario: cambia al editar y vuelve al restaurar", () => {
  const base = [
    { name: "name", type: "text", value: "A" },
    { name: "active", type: "checkbox", value: "on", checked: true },
    { name: "save", type: "submit", value: "Guardar" },
  ];
  const original = serializeFormControls(base);
  assert.notEqual(serializeFormControls([{ ...base[0], value: "B" }, base[1], base[2]]), original);
  assert.notEqual(serializeFormControls([base[0], { ...base[1], checked: false }, base[2]]), original);
  assert.equal(serializeFormControls([base[0], base[1], { ...base[2], value: "otro" }]), original);
});

test("foto del formulario: ignora campos marcados, cuenta archivos y filas nuevas", () => {
  const search = { name: "q", type: "search", value: "", ignore: true };
  const file = { name: "img", type: "file", value: "", fileCount: 0 };
  const original = serializeFormControls([search, file]);
  assert.equal(serializeFormControls([{ ...search, value: "jbl" }, file]), original);
  assert.notEqual(serializeFormControls([search, { ...file, fileCount: 1 }]), original);
  assert.notEqual(serializeFormControls([search, file, { name: "row", type: "text", value: "" }]), original);
});

test("select múltiple compara las opciones elegidas", () => {
  const a = serializeFormControls([{ name: "tags", type: "select-multiple", value: "", selectedValues: ["1", "2"] }]);
  const b = serializeFormControls([{ name: "tags", type: "select-multiple", value: "", selectedValues: ["1"] }]);
  assert.notEqual(a, b);
});

// ─── Filtro de clicks ───

test("enlace interno común: se frena", () => {
  const decision = shouldGuardLinkClick(click(), { href: "/admin/products" }, HERE);
  assert.equal(decision.guard, true);
  if (decision.guard) {
    assert.equal(decision.url.pathname, "/admin/products");
    assert.equal(decision.external, false);
  }
});

test("ctrl/cmd/shift/alt, rueda y botón derecho: no se frena", () => {
  for (const over of [{ ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }, { button: 2 }]) {
    assert.equal(shouldGuardLinkClick(click(over), { href: "/admin" }, HERE).guard, false, JSON.stringify(over));
  }
});

test("target=_blank, descargas y enlaces ignorados: no se frena", () => {
  assert.equal(shouldGuardLinkClick(click(), { href: "/admin", target: "_blank" }, HERE).guard, false);
  assert.equal(shouldGuardLinkClick(click(), { href: "/api/x.pdf", download: true }, HERE).guard, false);
  assert.equal(shouldGuardLinkClick(click(), { href: "/admin", ignore: true }, HERE).guard, false);
  assert.equal(shouldGuardLinkClick(click(), { href: "/admin", target: "_self" }, HERE).guard, true);
});

test("anclas, misma URL y esquemas que no salen de la página: no se frena", () => {
  for (const href of ["#precios", "?tab=general#x", HERE, "mailto:a@b.com", "tel:123", "javascript:void(0)", "", null]) {
    assert.equal(shouldGuardLinkClick(click(), { href }, HERE).guard, false, String(href));
  }
});

test("otra pestaña de la misma ficha (cambia el query) sí se frena", () => {
  assert.equal(shouldGuardLinkClick(click(), { href: "?tab=precios" }, HERE).guard, true);
});

test("enlace externo en la misma pestaña: se frena y se marca como externo", () => {
  const decision = shouldGuardLinkClick(click(), { href: "https://www.jbl.com/" }, HERE);
  assert.equal(decision.guard, true);
  if (decision.guard) assert.equal(decision.external, true);
});

test("click ya cancelado por otro handler: no se frena", () => {
  assert.equal(shouldGuardLinkClick(click({ defaultPrevented: true }), { href: "/admin" }, HERE).guard, false);
});

// ─── Autoguardado ───

test("autoguardado: avisa solo si queda algo sin guardar", () => {
  assert.equal(autosaveNeedsWarning("idle"), false);
  assert.equal(autosaveNeedsWarning("saved"), false);
  assert.equal(autosaveNeedsWarning("pending"), true);
  assert.equal(autosaveNeedsWarning("saving"), true);
  assert.equal(autosaveNeedsWarning("error"), true);
});
