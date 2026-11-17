import { test } from "node:test";
import assert from "node:assert/strict";
import {
  customerCategoryName,
  decideTangoCategory,
  isCustomerTreeNode,
  isUncategorizedCategory,
  modelVariantKey,
  UNCATEGORIZED_NAME,
  UNCATEGORIZED_SLUG,
  type ClassifiedSibling,
  type ManualRule,
} from "./tango-only";
import { buildCategoryCountTree } from "./catalog-category-tree";

const PATHS = new Set([
  "SONIDO > BAFLES PASIVOS > BAFLES PRO",
  "CONTROL > ACCESORIOS > TECLAS P/KEYPAD",
  "SONIDO > REPUESTOS > REPUESTOS P/BAFLES",
  "SONIDO > ACCESORIOS > ACCESORIOS P/BAFLES",
  "VIDEO > DIGITAL MEDIA > DM NVX",
]);
const SIBLINGS: ClassifiedSibling[] = [
  { brand: "BLAZE BY SONANCE", model: "CBL523-PAS-B", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES PRO" },
  { brand: "Crestron", model: "HZ2-BTNS-2-B BLANK", tangoPath: "CONTROL > ACCESORIOS > TECLAS P/KEYPAD" },
  { brand: "Crestron", model: "HZ2-BTNS-2-GLASS-W ENGRAVED", tangoPath: "CONTROL > ACCESORIOS > TECLAS P/KEYPAD" },
  { brand: "SoundTube", model: "GRL-X-BK", tangoPath: "SONIDO > REPUESTOS > REPUESTOS P/BAFLES" },
  { brand: "SoundTube", model: "GRL-X-WHT", tangoPath: "SONIDO > ACCESORIOS > ACCESORIOS P/BAFLES" },
];
const RULES: ManualRule[] = [{ brand: "Crestron", model: "DM-NVX-370", tangoPath: "VIDEO > DIGITAL MEDIA > DM NVX", motivo: "línea DM NVX" }];
const base = { siblings: SIBLINGS, manualRules: RULES, existingPaths: PATHS, proposal: null };

test("modelVariantKey: el mismo modelo en otro color/acabado/grabado da la misma clave", () => {
  assert.equal(modelVariantKey("CBL523-PAS-W"), modelVariantKey("CBL523-PAS-B"));
  assert.equal(modelVariantKey("HZ2-BTNS-2-DRK-NKL ENGRAVED"), "HZ2-BTNS-2");
  assert.equal(modelVariantKey("XPC-6R-T-BLK"), modelVariantKey("XPC-6R-T"));
  // Lo que cambia la función no es acabado: activo (a) vs pasivo (i), número de modelo.
  assert.notEqual(modelVariantKey("PS1090i"), modelVariantKey("PS1090a"));
  assert.notEqual(modelVariantKey("MPC3-102-B"), modelVariantKey("MPC3-201-B"));
  assert.notEqual(modelVariantKey("AC-PSCORD-EU"), modelVariantKey("AC-PSCORD-EU2"));
});

test("pasa a Tango con un hermano del mismo modelo ya clasificado", () => {
  const d = decideTangoCategory({ ...base, brand: "BLAZE BY SONANCE", model: "CBL523-PAS-W" });
  assert.equal(d.target, "tango");
  assert.equal(d.tangoPath, "SONIDO > BAFLES PASIVOS > BAFLES PRO");
});

test("los hermanos de otra marca no cuentan", () => {
  const d = decideTangoCategory({ ...base, brand: "SONANCE", model: "CBL523-PAS-W" });
  assert.equal(d.target, "uncategorized");
});

test("hermanos en rubros distintos: va a Sin categorizar", () => {
  const d = decideTangoCategory({ ...base, brand: "SoundTube", model: "GRL-X-WH" });
  assert.equal(d.target, "uncategorized");
  assert.match(d.motivo, /rubros distintos/);
});

test("hermanos clasificados pero la propuesta dice otra cosa: es dudoso", () => {
  const d = decideTangoCategory({
    ...base,
    brand: "BLAZE BY SONANCE",
    model: "CBL523-PAS-W",
    proposal: { tangoPath: "SONIDO > ACCESORIOS > ACCESORIOS P/BAFLES", confidence: "media", status: "PENDING" },
  });
  assert.equal(d.target, "uncategorized");
});

test("propuesta media sola no alcanza; propuesta alta sí", () => {
  const media = decideTangoCategory({ ...base, brand: "X", model: "Y", proposal: { tangoPath: "VIDEO > DIGITAL MEDIA > DM NVX", confidence: "media", status: "PENDING" } });
  assert.equal(media.target, "uncategorized");
  const alta = decideTangoCategory({ ...base, brand: "X", model: "Y", proposal: { tangoPath: "VIDEO > DIGITAL MEDIA > DM NVX", confidence: "alta", status: "PENDING" } });
  assert.equal(alta.target, "tango");
  const inexistente = decideTangoCategory({ ...base, brand: "X", model: "Y", proposal: { tangoPath: "NO > EXISTE", confidence: "alta", status: "PENDING" } });
  assert.equal(inexistente.target, "uncategorized");
});

test("regla explícita: aplica si el rubro existe y no choca con la propuesta", () => {
  assert.equal(decideTangoCategory({ ...base, brand: "crestron", model: "dm-nvx-370" }).target, "tango");
  const choca = decideTangoCategory({
    ...base,
    brand: "Crestron",
    model: "DM-NVX-370",
    proposal: { tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES PRO", confidence: "media", status: "PENDING" },
  });
  assert.equal(choca.target, "uncategorized");
});

test("sin propuesta ni hermanos: Sin categorizar, nunca se inventa un rubro", () => {
  const d = decideTangoCategory({ ...base, brand: "SONANCE", model: "D8 BLK" });
  assert.deepEqual(d, { target: "uncategorized", tangoPath: null, motivo: "Sin propuesta ni modelo hermano clasificado" });
});

test("Sin categorizar se reconoce por slug (o por nombre si no viene el slug)", () => {
  assert.ok(isUncategorizedCategory({ slug: UNCATEGORIZED_SLUG, name: "Lo que sea" }));
  assert.ok(isUncategorizedCategory({ name: UNCATEGORIZED_NAME }));
  assert.ok(!isUncategorizedCategory({ slug: "t-sonido", name: "Sonido" }));
  assert.ok(!isUncategorizedCategory(null));
});

test("el cliente no ve el nombre «Sin categorizar» en el producto", () => {
  assert.equal(customerCategoryName({ name: UNCATEGORIZED_NAME }), null);
  assert.equal(customerCategoryName({ slug: UNCATEGORIZED_SLUG, name: UNCATEGORIZED_NAME }), null);
  assert.equal(customerCategoryName({ slug: "t-x", name: "Bafles pro" }), "Bafles pro");
  assert.equal(customerCategoryName(null), null);
});

test("la columna de rubros del cliente solo muestra el árbol de Tango (sin viejas ni Sin categorizar)", () => {
  const nodes = [
    { id: "son", name: "Sonido", parentId: null, tangoPath: "SONIDO", slug: "t-sonido" },
    { id: "pro", name: "Bafles pro", parentId: "son", tangoPath: "SONIDO > BAFLES PRO", slug: "t-sonido-bafles-pro" },
    { id: "sin", name: UNCATEGORIZED_NAME, parentId: null, tangoPath: null, slug: UNCATEGORIZED_SLUG },
    { id: "vieja", name: "Amplifiers", parentId: null, tangoPath: null, slug: "amplifiers" },
  ];
  assert.deepEqual(nodes.filter(isCustomerTreeNode).map((n) => n.id), ["son", "pro"]);
  const tree = buildCategoryCountTree(nodes.filter(isCustomerTreeNode), [
    { categoryId: "pro", count: 3 },
    { categoryId: "sin", count: 7 },
    { categoryId: "vieja", count: 2 },
  ]);
  assert.deepEqual(new Map(tree.map((n) => [n.id, n.count])), new Map([["son", 3], ["pro", 3]]));
});
