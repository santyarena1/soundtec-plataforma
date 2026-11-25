import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  brandListingComparator,
  categorySortKeys,
  commonCategoryAncestor,
  matchCategoryByName,
  createBrandListingIndex,
  ordinal,
  resolveCategoryOrder,
  rubroHighlightFor,
  sectionsForPage,
  toggleRubroFirst,
  type BrandListingItem,
} from "./brand-listing-order";
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

// Árbol de 4 niveles como el de Tango: SONIDO > BAFLES PASIVOS > (COLGANTES · DE EMBUTIR > TECHO, PARED) · BAFLES ACTIVOS > IP
const tango = categorySortKeys([
  { id: "S", parentId: null, name: "Sonido", tangoPath: "SONIDO" },
  { id: "BP", parentId: "S", name: "Bafles pasivos", tangoPath: "SONIDO > BAFLES PASIVOS" },
  { id: "COL", parentId: "BP", name: "Bafles colgantes", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES COLGANTES" },
  { id: "EMB", parentId: "BP", name: "Bafles de embutir", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES DE EMBUTIR" },
  { id: "TEC", parentId: "EMB", name: "Techo", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES DE EMBUTIR > TECHO" },
  { id: "PAR", parentId: "EMB", name: "Pared", tangoPath: "SONIDO > BAFLES PASIVOS > BAFLES DE EMBUTIR > PARED" },
  { id: "BA", parentId: "S", name: "Bafles activos", tangoPath: "SONIDO > BAFLES ACTIVOS" },
  { id: "IP", parentId: "BA", name: "Bafles IP", tangoPath: "SONIDO > BAFLES ACTIVOS > BAFLES IP" },
  { id: "ACC", parentId: "S", name: "Accesorios", tangoPath: "SONIDO > ACCESORIOS" },
  { id: "REJ", parentId: "ACC", name: "Rejillas", tangoPath: "SONIDO > ACCESORIOS > REJILLAS" },
  // Categoría vieja (sin ruta de Tango), desactivada, y «Sin categorizar».
  { id: "VIEJA", parentId: null, name: "Parlantes", tangoPath: null, isActive: false },
  { id: "SINCAT", parentId: null, name: "Sin categorizar", tangoPath: null },
]);
const tangoRows = [
  row("techo-1", "TEC"),
  row("pared-1", "PAR"),
  row("colg-1", "COL"),
  row("ip-1", "IP"),
  row("rej-1", "REJ"),
  row("viejo-1", "VIEJA"),
  row("sincat-1", "SINCAT"),
  row("sin-rubro", null),
];
const indexFor = (categoryOrder: string[]) => createBrandListingIndex({ categoryOrder, categories: tango });
const sortWith = (rows: Row[], categoryOrder: string[]) => [...rows].sort(indexFor(categoryOrder).comparator<Row>(byName));

describe("orden por marca con el árbol de Tango", () => {
  it("un rubro elegido de nivel 2 trae todos sus subrubros (nivel 3 y 4) y los agrupa por nivel 3", () => {
    const sorted = sortWith(tangoRows, ["BP"]);
    assert.deepEqual(sorted.map((r) => r.name).slice(0, 3), ["colg-1", "pared-1", "techo-1"]);
    const sections = indexFor(["BP"]).sectionsOf(sorted);
    assert.deepEqual(
      sections.map((s) => [s.title, s.chosenPosition]),
      [
        ["Bafles colgantes", 0],
        ["Bafles de embutir", 0],
        // No elegidos: por ruta, con encabezado de nivel 3.
        ["Rejillas", null],
        ["Bafles IP", null],
        ["Otros productos", null],
      ]
    );
    assert.equal(sections[1].context, "Sonido › Bafles pasivos");
  });

  it("un subrubro de nivel 4 elegido sale primero con su propio encabezado y le gana al padre", () => {
    const sorted = sortWith(tangoRows, ["TEC", "BP"]);
    assert.deepEqual(sorted.map((r) => r.name).slice(0, 3), ["techo-1", "colg-1", "pared-1"]);
    assert.equal(indexFor(["TEC", "BP"]).sectionsOf(sorted)[0].title, "Techo");
  });

  it("rubros viejos, «Sin categorizar» y sin rubro van al final, en «Otros productos»", () => {
    const sorted = sortWith(tangoRows, []).map((r) => r.name);
    assert.deepEqual(sorted.slice(-3).sort(), ["sin-rubro", "sincat-1", "viejo-1"]);
    // Sin orden elegido: rubros por ruta alfabética (ACCESORIOS < BAFLES ACTIVOS < BAFLES PASIVOS).
    assert.deepEqual(sorted.slice(0, 5), ["rej-1", "ip-1", "colg-1", "pared-1", "techo-1"]);
  });

  it("los destacados forman la sección «Destacados» arriba de todo", () => {
    const starred = tangoRows.map((r) => (r.name === "rej-1" || r.name === "viejo-1" ? { ...r, isFeatured: true } : r));
    const sorted = sortWith(starred, ["IP"]);
    assert.deepEqual(sorted.map((r) => r.name).slice(0, 3), ["rej-1", "viejo-1", "ip-1"]);
    const sections = indexFor(["IP"]).sectionsOf(sorted);
    assert.deepEqual(sections.slice(0, 2).map((s) => [s.kind, s.title, s.startIndex]), [
      ["featured", "Destacados", 0],
      ["rubro", "Bafles IP", 2],
    ]);
  });

  it("las secciones de una página repiten arriba la que viene de la anterior", () => {
    const sorted = sortWith(tangoRows, ["BP"]);
    const all = indexFor(["BP"]).sectionsOf(sorted);
    const page2 = sectionsForPage(all, 2, 3); // productos 3 a 5: techo-1, rej-1, ip-1
    assert.deepEqual(page2.map((s) => [s.title, s.startIndex, Boolean(s.continued)]), [
      ["Bafles de embutir", 0, true],
      ["Rejillas", 1, false],
      ["Bafles IP", 2, false],
    ]);
  });
});

describe("orden guardado con rubros viejos", () => {
  it("pasa los viejos a su equivalente de Tango y descarta los que no tienen, avisando", () => {
    const resolved = resolveCategoryOrder(["IP", "VIEJA", "BORRADO", "SINCAT", "IP"], tango, new Map([["VIEJA", "BP"]]));
    assert.deepEqual(resolved.order, ["IP", "BP"]);
    assert.deepEqual(resolved.migrated, [{ from: "VIEJA", fromName: "Parlantes", to: "BP" }]);
    assert.deepEqual(resolved.dropped.map((d) => d.id), ["BORRADO", "SINCAT"]);
  });

  it("el equivalente de una categoría vieja es el rubro común donde terminaron sus productos (nivel 2 o más)", () => {
    assert.equal(commonCategoryAncestor(["TEC", "COL"], tango), "BP");
    assert.equal(commonCategoryAncestor(["TEC"], tango), "TEC");
    // Repartidos entre pasivos y activos: solo comparten «Sonido» (nivel 1), no alcanza.
    assert.equal(commonCategoryAncestor(["TEC", "IP"], tango), null);
    assert.equal(commonCategoryAncestor([], tango), null);
  });

  it("sin reclasificación registrada, se busca el rubro de la marca con el mismo nombre (si hay uno solo)", () => {
    const candidates = [
      { id: "COL", name: "Bafles colgantes" },
      { id: "BP", name: "Bafles pasivos" },
      { id: "TEC", name: "Techo" },
    ];
    assert.equal(matchCategoryByName("Bafle pasivo", candidates), "BP");
    assert.equal(matchCategoryByName("TECHO", candidates), "TEC");
    assert.equal(matchCategoryByName("Bafles", candidates), null);
    assert.equal(matchCategoryByName("Techo", [...candidates, { id: "TEC2", name: "Techos" }]), null);
    assert.equal(matchCategoryByName(null, candidates), null);
  });
});

describe("destacar rubro desde un producto", () => {
  it("el rubro del producto es su nivel 3 y muestra dónde está en el orden", () => {
    const order = ["IP", "BP"];
    const h = rubroHighlightFor(indexFor(order), order, "TEC");
    assert.equal(h?.rubroId, "EMB");
    assert.equal(h?.position, null);
    assert.deepEqual(h?.coveredBy, { id: "BP", name: "Bafles pasivos", position: 1 });
    assert.equal(rubroHighlightFor(indexFor(order), order, "VIEJA"), null);
  });

  it("destacar lo pone 1.º (sin duplicar) y quitarlo lo saca del orden", () => {
    assert.deepEqual(toggleRubroFirst(["IP", "BP"], "EMB", true), ["EMB", "IP", "BP"]);
    assert.deepEqual(toggleRubroFirst(["IP", "EMB", "BP"], "EMB", true), ["EMB", "IP", "BP"]);
    assert.deepEqual(toggleRubroFirst(["EMB", "IP"], "EMB", false), ["IP"]);
    const order = toggleRubroFirst(["IP", "BP"], "EMB", true);
    assert.equal(rubroHighlightFor(indexFor(order), order, "PAR")?.position, 0);
    assert.equal(ordinal(0), "1.º");
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
