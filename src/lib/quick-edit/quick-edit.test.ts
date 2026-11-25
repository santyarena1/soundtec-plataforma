import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Prisma, RuleScopeType } from "@prisma/client";
import { quickEditAccess } from "./access";
import { cleanDocs, cleanFeatures, cleanSpecs, docsFromJson, specsFromJson } from "./content";
import { applyPriceDraft, markupForTargetPrice, parseDecimal, planPriceSave, simulateDiscountRules, simulateMarginRules, type ProductPriceFields } from "./price-draft";
import { calculateCustomerPrice, type ProductPricingInput } from "@/lib/pricing";
import type { Permissions } from "@/lib/permissions";

const ADMIN: Permissions = { scopes: ["products.edit", "margins.manage", "discounts.manage", "categories.manage"], priceAccess: "full" };

// ── Permisos ──

test("un cliente del portal nunca ve la edición rápida, aunque su rol diga lo contrario", () => {
  assert.equal(quickEditAccess("CLIENT", { scopes: ["products.edit"], fullAccess: true, priceAccess: "full" }).canOpen, false);
  assert.equal(quickEditAccess(null, ADMIN).canOpen, false);
});

test("equipo sin permiso de editar productos o sin acceso a costos: no la ve", () => {
  assert.equal(quickEditAccess("STAFF", { scopes: ["products.view"], priceAccess: "full" }).canOpen, false);
  assert.equal(quickEditAccess("STAFF", { scopes: ["products.edit"], priceAccess: "sale" }).canOpen, false);
  assert.equal(quickEditAccess("STAFF", { scopes: ["products.edit"], priceAccess: "none" }).canOpen, false);
});

test("equipo con products.edit y costos la ve; márgenes y descuentos según su rol", () => {
  const staff = quickEditAccess("STAFF", { scopes: ["products.edit"], priceAccess: "full" });
  assert.deepEqual(staff, { canOpen: true, canEditPrices: true, canEditMargins: false, canEditDiscountRules: false, canCreateSubrubro: false });
  const admin = quickEditAccess("ADMIN", ADMIN);
  assert.equal(admin.canEditMargins && admin.canEditDiscountRules && admin.canCreateSubrubro, true);
});

test("todas las acciones de la edición rápida validan el permiso antes de hacer nada", () => {
  const root = join(__dirname, "..", "..");
  const shared = readFileSync(join(root, "server", "quick-edit", "shared.ts"), "utf8");
  assert.match(shared, /requireStaff\("products\.edit", \{ costs: true \}\)/);
  for (const file of ["quick-edit.ts", "quick-edit-pricing.ts"]) {
    const source = readFileSync(join(root, "server", "actions", file), "utf8");
    assert.match(source, /^"use server";/);
    const bodies = source.split(/\nexport async function /).slice(1);
    assert.ok(bodies.length >= 3, `${file}: se esperaban acciones exportadas`);
    for (const body of bodies) {
      const name = body.slice(0, body.indexOf("("));
      const guard = body.indexOf("await requireQuickEdit()");
      assert.ok(guard > 0, `${file} › ${name} no llama a requireQuickEdit`);
      for (const touch of ["prisma.", "saveProductPatch(", "proposePriceReview("]) {
        const at = body.indexOf(touch);
        assert.ok(at === -1 || at > guard, `${file} › ${name} toca datos antes del permiso`);
      }
    }
  }
});

// ── Contenido ──

test("especificaciones: prefiere el castellano y vuelve a guardar rótulo y valor", () => {
  const rows = specsFromJson([{ label: "Power", labelEs: "Potencia", value: "100 W", group: "Audio" }, { name: "Peso", value: 2 }, { foo: 1 }]);
  assert.deepEqual(rows, [
    { group: "Audio", label: "Potencia", value: "100 W" },
    { group: "", label: "Peso", value: "2" },
  ]);
  const saved = cleanSpecs([...rows, { group: "", label: "", value: "" }]);
  assert.ok(saved.ok);
  assert.deepEqual(saved.data[0], { group: "Audio", label: "Potencia", value: "100 W", labelEs: "Potencia", valueEs: "100 W" });
  assert.equal(saved.data.length, 2);
  const incomplete = cleanSpecs([{ group: "", label: "Potencia", value: "" }]);
  assert.equal(incomplete.ok, false);
});

test("características sin vacías ni repetidas; documentos solo con http(s)", () => {
  const f = cleanFeatures(["  Bluetooth ", "", "bluetooth", "Wi-Fi"]);
  assert.deepEqual(f.ok && f.data, ["Bluetooth", "Wi-Fi"]);
  assert.equal(cleanDocs([{ name: "Manual", url: "javascript:alert(1)" }]).ok, false);
  assert.equal(cleanDocs([{ name: "", url: "https://x.com/a.pdf" }]).ok, false);
  const ok = cleanDocs([{ name: "Manual", url: "https://x.com/a.pdf" }]);
  assert.deepEqual(ok.ok && ok.data, [{ name: "Manual", nameEs: "Manual", url: "https://x.com/a.pdf" }]);
  assert.deepEqual(docsFromJson([{ nameEs: "Ficha", fileUrl: "https://x.com/f.pdf" }, { name: "sin url" }]), [{ name: "Ficha", url: "https://x.com/f.pdf" }]);
});

// ── Precios: simulación ──

const FIELDS: ProductPriceFields = {
  baseCostUsd: 100,
  distributorId: null,
  coefNac: 1.2,
  coefVta: null,
  coefVtaFob: null,
  tariffDutyPercent: null,
  ivaPercent: 21,
  impIntPercent: null,
  discountPercent: null,
  requiresQuote: false,
};

const INPUT: ProductPricingInput = {
  productId: "p1",
  baseCostUsd: 100,
  brandId: "b1",
  distributorId: null,
  categoryId: null,
  categoryAncestorIds: [],
  familyId: null,
  familyScopeResolved: true,
  productDiscountPercent: null,
  coefNac: 1.2,
  ivaPercent: 21,
};

const now = new Date();
const margin = (id: string, scopeType: RuleScopeType, scopeId: string | null, markup: number, groupId: string | null = null) => ({
  id,
  name: id,
  priority: 100,
  scopeType,
  scopeId,
  clientId: null,
  productId: scopeType === "PRODUCT" ? scopeId : null,
  marginPercent: new Prisma.Decimal((markup - 1) * 100),
  markupMultiplier: new Prisma.Decimal(markup),
  isActive: true,
  notes: null,
  groupId,
  isExemption: false,
  createdAt: now,
  updatedAt: now,
});
const discount = (id: string, scopeType: RuleScopeType, scopeId: string | null, percent: number) => ({
  id,
  name: id,
  priority: 100,
  scopeType,
  scopeId,
  clientId: null,
  productId: null,
  discountPercent: new Prisma.Decimal(percent),
  isActive: true,
  notes: null,
  groupId: null,
  isExemption: false,
  createdAt: now,
  updatedAt: now,
});

const withMarkup = <R extends ReturnType<typeof margin>>(r: R, m: number): R => ({ ...r, markupMultiplier: new Prisma.Decimal(m), marginPercent: new Prisma.Decimal((m - 1) * 100) });
const own = (m: number) => margin("own", RuleScopeType.PRODUCT, "p1", m, "catalogo:p1");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const price = (product: ProductPricingInput, marginRules: any[], discountRules: any[]) =>
  calculateCustomerPrice({ product, clientId: null, marginRules, discountRules, defaultMarkupMultiplier: 1.35, tcOverride: 1000, rounding: null });

test("simulación: cambiar el costo y el descuento propio mueve el precio con el motor real", async () => {
  const rules = [margin("marca", RuleScopeType.BRAND, "b1", 2)];
  const before = await price(INPUT, rules, []);
  assert.equal(before.priceUsdFinal, 240); // 100 × 1,2 × 2
  const after = await price(applyPriceDraft(INPUT, { ...FIELDS, baseCostUsd: 150, discountPercent: 10 }), rules, []);
  assert.equal(Math.round(after.priceUsdFinal * 100) / 100, 324); // 150 × 1,2 × 2 × 0,9
  assert.equal(after.discountSource, "PRODUCT");
  assert.deepEqual(INPUT.baseCostUsd, 100, "el borrador no toca el original");
});

test("simulación: el markup propio gana sobre la regla de marca y se puede quitar", async () => {
  const rules = [margin("marca", RuleScopeType.BRAND, "b1", 2), own(3)];
  const withOwn = await price(INPUT, simulateMarginRules(rules, "p1", 2.5, {}, withMarkup, own), []);
  assert.equal(withOwn.priceUsdFinal, 300);
  const removed = await price(INPUT, simulateMarginRules(rules, "p1", null, {}, withMarkup, own), []);
  assert.equal(removed.priceUsdFinal, 240);
  assert.equal(removed.appliedMarginRule?.id, "marca");
});

test("simulación: valores nuevos en reglas de margen y de descuento", async () => {
  const margins = simulateMarginRules([margin("marca", RuleScopeType.BRAND, "b1", 2)], "p1", null, { marca: 1.5 }, withMarkup, own);
  const discounts = simulateDiscountRules([discount("dto", RuleScopeType.GLOBAL, null, 5)], { dto: 20 }, (r, p) => ({ ...r, discountPercent: new Prisma.Decimal(p) }));
  const result = await price(INPUT, margins, discounts);
  assert.equal(Math.round(result.priceUsdFinal * 100) / 100, 144); // 120 × 1,5 × 0,8
});

// ── Precios: qué va directo y qué pasa por revisión ──

const RULES = [
  { id: "marca", kind: "margin" as const, scope: "BRAND", value: 2, origin: "rule" as const },
  { id: "st", kind: "margin" as const, scope: "PRODUCT", value: 1.9, origin: "soundtube" as const },
  { id: "dto", kind: "discount" as const, scope: "GLOBAL", value: 5, origin: "rule" as const },
];

test("guardar: lo propio del producto va directo, las reglas generales y de descuento a revisión", () => {
  const plan = planPriceSave(
    { fields: FIELDS, ownMarkup: null, rules: RULES },
    { fields: { ...FIELDS, baseCostUsd: 120, requiresQuote: true }, ownMarkup: 2.2, ruleValues: { marca: 2.5, st: 2, dto: 10 } }
  );
  assert.deepEqual(plan.fields, { baseCostUsd: 120, requiresQuote: true });
  assert.deepEqual(plan.changes, [
    { route: "direct-own-markup", value: 2.2 },
    { route: "review", ruleId: "marca", kind: "margin", value: 2.5 },
    { route: "direct-product-rule", ruleId: "st", value: 2 },
    { route: "review", ruleId: "dto", kind: "discount", value: 10 },
  ]);
  assert.equal(plan.needsReview, true);
});

test("guardar: sin cambios no hace nada; quitar el markup propio es directo", () => {
  const same = planPriceSave({ fields: FIELDS, ownMarkup: 2, rules: RULES }, { fields: { ...FIELDS }, ownMarkup: 2, ruleValues: { marca: 2, dto: 5 } });
  assert.equal(same.hasChanges, false);
  const clear = planPriceSave({ fields: FIELDS, ownMarkup: 2, rules: RULES }, { fields: FIELDS, ownMarkup: null, ruleValues: {} });
  assert.deepEqual(clear.changes, [{ route: "clear-own-markup" }]);
  assert.equal(clear.needsReview, false);
});

test("precio final buscado → markup, y números en castellano", () => {
  assert.equal(markupForTargetPrice(300, 120, 0), 2.5);
  assert.equal(markupForTargetPrice(270, 120, 10), 2.5);
  assert.equal(markupForTargetPrice(100, 0, 0), null);
  assert.equal(parseDecimal("2,75"), 2.75);
  assert.equal(parseDecimal("1.234,5"), 1234.5);
  assert.equal(parseDecimal("1.8"), 1.8);
  assert.equal(parseDecimal(""), null);
  assert.equal(parseDecimal("abc"), null);
});
