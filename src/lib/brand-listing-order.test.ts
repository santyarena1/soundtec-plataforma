import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandListingComparator, categorySortKeys, type BrandListingItem } from "./brand-listing-order";
import { hiddenCategoryIdsFrom, isCustomerHiddenCategory } from "./customer-hidden-categories";
import { CUSTOMER_STOCK_LABEL, ORIGIN_STOCK_LABEL, SHOW_STOCK_TO_CUSTOMERS, originStockText } from "./stock-display";

// Árbol: SONIDO > BAFLES (colgantes, techo) · SOPORTES · VIDEO
const categories = categorySortKeys([
  { id: "sonido", parentId: null, name: "Sonido", tangoPath: "SONIDO" },
  { id: "bafles", parentId: "sonido", name: "Bafles pasivos", tangoPath: "SONIDO > BAFLES PASIVOS" },
  { id: "colgantes", parentId: "bafles", name: "Bafles colgantes", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES COLGANTES" },
  { id: "techo", parentId: "bafles", name: "Techo", tangoPath: "SONIDO > BAFLES PASIVOS > TECHO" },
  { id: "amps", parentId: "sonido", name: "Amplificadores", tangoPath: "SONIDO > AMPLIFICADORES" },
  { id: "soportes", parentId: null, name: "Soportes", tangoPath: "SOPORTES" },
  { id: "video", parentId: null, name: "Video", tangoPath: "VIDEO" },
]);

type Row = BrandListingItem & { name: string };
const row = (name: string, categoryId: string | null, isFeatured = false): Row => ({ id: name, name, categoryId, isFeatured });
const byName = (a: Row, b: Row) => a.name.localeCompare(b.name);
const order = (rows: Row[], categoryOrder: string[]) =>
  [...rows].sort(brandListingComparator<Row>({ categoryOrder, categories, fallback: byName })).map((r) => r.name);

const rows = [
  row("amp-1", "amps"),
  row("soporte-1", "soportes"),
  row("colgante-1", "colgantes"),
  row("techo-1", "techo"),
  row("video-1", "video"),
  row("sin-rubro", null),
  row("colgante-2", "colgantes"),
];

describe("orden al entrar a una marca", () => {
  it("agrupa por rubro con el rubro elegido primero", () => {
    assert.deepEqual(order(rows, ["soportes"]), [
      "soporte-1",
      // No elegidos: por ruta alfabética y agrupados.
      "amp-1",
      "colgante-1",
      "colgante-2",
      "techo-1",
      "video-1",
      "sin-rubro",
    ]);
  });

  it("elegir un rubro abarca sus subrubros, y un subrubro elegido antes le gana al padre", () => {
    assert.deepEqual(order(rows, ["techo", "sonido", "video"]), [
      "techo-1",
      "amp-1",
      "colgante-1",
      "colgante-2",
      "video-1",
      "soporte-1",
      "sin-rubro",
    ]);
  });

  it("los destacados van primero y, entre ellos, también por rubro", () => {
    const starred = rows.map((r) => (r.name === "video-1" || r.name === "amp-1" ? { ...r, isFeatured: true } : r));
    assert.deepEqual(order(starred, ["video", "sonido"]).slice(0, 3), ["video-1", "amp-1", "colgante-1"]);
  });

  it("al quitar la estrella vuelve a su lugar por rubro", () => {
    const starred = rows.map((r) => (r.name === "video-1" ? { ...r, isFeatured: true } : r));
    assert.equal(order(starred, ["soportes"])[0], "video-1");
    assert.deepEqual(order(rows, ["soportes"]), order(starred.map((r) => ({ ...r, isFeatured: false })), ["soportes"]));
  });

  it("sin orden elegido: por ruta del rubro y sin rubro al final", () => {
    assert.deepEqual(order(rows, []), ["amp-1", "colgante-1", "colgante-2", "techo-1", "soporte-1", "video-1", "sin-rubro"]);
  });

  it("un id de rubro que ya no existe no rompe el orden", () => {
    assert.equal(order(rows, ["borrado", "video"])[0], "video-1");
  });
});

describe("rubros ocultos para clientes", () => {
  it("Indumentaria y todo lo que cuelga de ella", () => {
    assert.equal(isCustomerHiddenCategory({ name: "Indumentaria", tangoPath: "INSUMOS GENERALES > INDUMENTARIA" }), true);
    assert.equal(isCustomerHiddenCategory({ name: "Uniforme", tangoPath: "INSUMOS GENERALES > INDUMENTARIA > UNIFORME" }), true);
    assert.equal(isCustomerHiddenCategory({ name: "Indumentaria" }), true);
    assert.equal(isCustomerHiddenCategory({ name: "Pilas & baterías", tangoPath: "INSUMOS GENERALES > PILAS & BATERIAS" }), false);
    assert.equal(isCustomerHiddenCategory({ name: "Sonido", tangoPath: "SONIDO" }), false);
  });

  it("expande a los descendientes aunque no tengan la ruta cargada", () => {
    const ids = hiddenCategoryIdsFrom([
      { id: "insumos", parentId: null, name: "Insumos generales", tangoPath: "INSUMOS GENERALES" },
      { id: "ind", parentId: "insumos", name: "Indumentaria", tangoPath: "INSUMOS GENERALES > INDUMENTARIA" },
      { id: "remera", parentId: "ind", name: "Remera", tangoPath: null },
      { id: "pilas", parentId: "insumos", name: "Pilas", tangoPath: "INSUMOS GENERALES > PILAS" },
    ]);
    assert.deepEqual(ids.sort(), ["ind", "remera"]);
  });
});

describe("stock: cliente vs. equipo Soundtec", () => {
  it("el cliente no ve stock: ve «Consultá stock»", () => {
    assert.equal(SHOW_STOCK_TO_CUSTOMERS, false);
    assert.equal(CUSTOMER_STOCK_LABEL, "Consultá stock");
  });

  it("el stock del proveedor lleva su propio rótulo", () => {
    assert.match(ORIGIN_STOCK_LABEL, /origen/i);
    assert.deepEqual(originStockText("IN_STOCK", 640), { text: "En stock · 640", tone: "success" });
    assert.deepEqual(originStockText("OUT_OF_STOCK", 0), { text: "Sin stock", tone: "destructive" });
    assert.equal(originStockText("UNKNOWN", null).text, "Sin dato");
  });
});
