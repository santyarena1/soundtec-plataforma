import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildQuickFilters, parseLabelParam, parseTagParam, quickFilterHref, type QuickFilterCounts } from "./catalog-quick-filters";

const counts: QuickFilterCounts = {
  labels: [
    { id: "lbl_promo01", name: "Precio promocional", color: "#b4232c", count: 12 },
    { id: "lbl_especial", name: "Precio especial", color: "#0f766e", count: 3 },
    { id: "lbl_vacia001", name: "Etiqueta sin productos", color: "#123456", count: 0 },
  ],
  tags: [
    { key: "LIQUIDACION", count: 4 },
    { key: "A_PEDIDO", count: 16 },
  ],
  discount: 9,
  favorites: 0,
};

describe("botones de filtro rápido (uno por etiqueta)", () => {
  it("uno por etiqueta y cartel con productos, más «Con descuento»; sin los vacíos", () => {
    const list = buildQuickFilters(counts, {});
    assert.deepEqual(
      list.map((f) => f.label),
      ["Precio especial", "Precio promocional", "A pedido", "Liquidación", "Con descuento"]
    );
    assert.equal(list.find((f) => f.id === "lbl_promo01")?.color, "#b4232c");
  });

  it("un botón tocado se muestra aunque ya no tenga productos (para poder soltarlo)", () => {
    const list = buildQuickFilters(counts, { favoritesOnly: true, labelIds: ["lbl_vacia001"] });
    assert.ok(list.some((f) => f.kind === "favorites" && f.active));
    assert.ok(list.some((f) => f.id === "lbl_vacia001" && f.active));
  });

  it("sin precios (público) ni sesión no hay «Con descuento» ni «Favoritos»", () => {
    const list = buildQuickFilters({ ...counts, discount: null, favorites: null }, {});
    assert.ok(!list.some((f) => f.kind === "discount" || f.kind === "favorites"));
  });

  it("el link prende el botón sin tocar marca, rubro ni búsqueda, y vuelve a la página 1", () => {
    const params = { brand: "b1", category: "c1", q: "parlante techo", page: "3" };
    const href = quickFilterHref("/portal/products", params, { kind: "label", id: "lbl_promo01", active: false });
    const url = new URL(href, "http://x");
    assert.equal(url.pathname, "/portal/products");
    assert.equal(url.searchParams.get("brand"), "b1");
    assert.equal(url.searchParams.get("category"), "c1");
    assert.equal(url.searchParams.get("q"), "parlante techo");
    assert.equal(url.searchParams.get("page"), null);
    assert.deepEqual(url.searchParams.getAll("label"), ["lbl_promo01"]);
  });

  it("se combinan: suma una etiqueta a otra y apaga solo la tocada", () => {
    const on = quickFilterHref("/catalogo", { label: "lbl_especial", tag: "A_PEDIDO" }, { kind: "label", id: "lbl_promo01", active: false });
    assert.deepEqual(new URL(on, "http://x").searchParams.getAll("label"), ["lbl_especial", "lbl_promo01"]);
    const off = quickFilterHref("/catalogo", { label: ["lbl_especial", "lbl_promo01"], tag: "A_PEDIDO" }, { kind: "label", id: "lbl_especial", active: true });
    const url = new URL(off, "http://x");
    assert.deepEqual(url.searchParams.getAll("label"), ["lbl_promo01"]);
    assert.equal(url.searchParams.get("tag"), "A_PEDIDO");
  });

  it("descuento y favoritos prenden y apagan su parámetro", () => {
    const on = quickFilterHref("/portal/products", { brand: "b1" }, { kind: "discount", id: "discount", active: false });
    assert.equal(new URL(on, "http://x").searchParams.get("discount"), "1");
    const off = quickFilterHref("/portal/products", { brand: "b1", fav: "1" }, { kind: "favorites", id: "favorites", active: true });
    assert.equal(new URL(off, "http://x").searchParams.get("fav"), null);
  });

  it("apagar el último filtro deja el listado completo (no vuelve a la grilla de marcas)", () => {
    assert.equal(quickFilterHref("/portal/products", { discount: "1" }, { kind: "discount", id: "discount", active: true }), "/portal/products?all=1");
  });

  it("los parámetros se validan: carteles conocidos e ids razonables, sin repetir", () => {
    assert.deepEqual(parseTagParam(["LIQUIDACION", "INVENTADO", "LIQUIDACION"]), ["LIQUIDACION"]);
    assert.deepEqual(parseLabelParam("lbl_promo01,lbl_promo01,<script>"), ["lbl_promo01"]);
    assert.deepEqual(parseLabelParam(undefined), []);
  });
});
