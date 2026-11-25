import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  COMPARE_MAX,
  compareHref,
  mergeSelections,
  parseCompareIds,
  parseStoredSelection,
  removeFromSelection,
  serializeSelection,
  toggleInSelection,
  type CompareItem,
} from "./selection";
import { buildSpecTable, normalizeSpecLabel, onlyDifferences } from "./spec-table";

const item = (id: string, brand = "Sonance"): CompareItem => ({ id, name: `Modelo ${id}`, brand, image: null });

describe("selección para comparar", () => {
  it("marca y desmarca; con 4 no suma un quinto ni saca ninguno", () => {
    let list: CompareItem[] = [];
    for (const id of ["a", "b", "c", "d"]) list = toggleInSelection(list, item(id)).items;
    assert.equal(list.length, COMPARE_MAX);
    const full = toggleInSelection(list, item("e"));
    assert.equal(full.status, "full");
    assert.deepEqual(full.items.map((i) => i.id), ["a", "b", "c", "d"]);
    const off = toggleInSelection(list, item("b"));
    assert.equal(off.status, "removed");
    assert.deepEqual(off.items.map((i) => i.id), ["a", "c", "d"]);
    assert.deepEqual(removeFromSelection(off.items, "a").map((i) => i.id), ["c", "d"]);
  });

  it("se guarda y se recupera igual (persistencia entre búsquedas, marcas y páginas)", () => {
    const saved = serializeSelection([item("p1", "JAMES"), item("p2", "SoundTube")]);
    assert.deepEqual(parseStoredSelection(saved), [item("p1", "JAMES"), item("p2", "SoundTube")]);
  });

  it("lo guardado roto, viejo o tocado a mano no rompe: se descarta lo inválido", () => {
    assert.deepEqual(parseStoredSelection("{no es json"), []);
    assert.deepEqual(parseStoredSelection(null), []);
    assert.deepEqual(parseStoredSelection(JSON.stringify({ items: "x" })), []);
    // Formato viejo (lista suelta), un id con caracteres raros y repetidos.
    const legacy = JSON.stringify([{ id: "ok1", name: "A" }, { id: "<img>", name: "B" }, { id: "ok1", name: "A otra vez" }, 7]);
    assert.deepEqual(parseStoredSelection(legacy).map((i) => i.id), ["ok1"]);
  });

  it("al unir dos selecciones (otra pestaña, antes de cargar) manda la principal, sin repetir y hasta 4", () => {
    const merged = mergeSelections([item("a"), item("b"), item("c")], [item("b"), item("x"), item("y")]);
    assert.deepEqual(merged.map((i) => i.id), ["a", "b", "c", "x"]);
  });

  it("los ids de la URL se validan y se cortan en 4", () => {
    assert.deepEqual(parseCompareIds("a,b,,b,c,d,e"), ["a", "b", "c", "d"]);
    assert.deepEqual(parseCompareIds(["a", "../etc"]), ["a"]);
    assert.equal(compareHref("/portal/comparar", [item("a"), item("b")]), "/portal/comparar?ids=a,b");
  });
});

describe("tabla de especificaciones alineada por rótulo", () => {
  it("normaliza rótulos: acentos, paréntesis y unidades fuera", () => {
    assert.equal(normalizeSpecLabel("Frequency Response (+/- 3dB)"), "frequency response");
    assert.equal(normalizeSpecLabel("Respuesta en frecuencia (±3 dB)"), "respuesta en frecuencia");
    assert.equal(normalizeSpecLabel("Shipping Dimensions WxHxD"), "shipping dimensions");
  });

  it("junta rótulos equivalentes en inglés y español en una sola fila", () => {
    const table = buildSpecTable([
      { specifications: [{ label: "Frequency Response (+/- 3dB)", value: "45 Hz - 20 kHz" }, { label: "Weight", value: "2.5 lb" }] },
      { specifications: [{ labelEs: "Respuesta en frecuencia (±3 dB)", label: "Frequency Response", valueEs: "40 Hz – 22 kHz" }, { label: "Peso", value: "1,1 kg" }] },
    ]);
    const rows = table.groups.flatMap((g) => g.rows);
    const freq = rows.find((r) => r.key === "frequency");
    assert.equal(freq?.label, "Respuesta en frecuencia");
    assert.deepEqual(freq?.values, ["45 Hz - 20 kHz", "40 Hz – 22 kHz"]);
    assert.equal(rows.filter((r) => r.key === "weight").length, 1);
  });

  it("deja afuera SKU, UPC, marca y rubro; marca las diferencias y los faltantes", () => {
    const table = buildSpecTable([
      { specifications: [{ label: "SKU", value: "1" }, { label: "Product Brand", value: "Sonance" }, { label: "Impedance", value: "8 Ohm" }, { label: "Color", value: "Blanco" }] },
      { specifications: [{ label: "UPC", value: "2" }, { label: "Impedancia nominal", value: "8 ohm" }, { label: "Color", value: "Negro" }, { label: "IP Rating", value: "IP65" }] },
    ]);
    const rows = table.groups.flatMap((g) => g.rows);
    assert.ok(!rows.some((r) => /sku|upc|brand/i.test(r.key)));
    assert.equal(rows.find((r) => r.key === "impedance")?.differs, false, "8 Ohm y 8 ohm son lo mismo");
    assert.equal(rows.find((r) => r.key === "color")?.differs, true);
    const ip = rows.find((r) => r.key === "ip");
    assert.deepEqual(ip?.values, [null, "IP65"]);
    assert.equal(ip?.differs, true);
    assert.equal(table.diffCount, 2);
    assert.deepEqual(onlyDifferences(table).flatMap((g) => g.rows.map((r) => r.key)).sort(), ["color", "ip"]);
  });

  it("completa medidas y peso con los datos propios del producto si la ficha no los trae", () => {
    const table = buildSpecTable([
      { specifications: [], widthCm: 20, heightCm: 30.5, depthCm: 10, weightKg: 2 },
      { specifications: [{ label: "Weight", value: "3 kg" }], weightKg: 9 },
    ]);
    const rows = table.groups.flatMap((g) => g.rows);
    assert.deepEqual(rows.find((r) => r.key === "weight")?.values, ["2 kg", "3 kg"], "la ficha manda sobre la columna");
    assert.deepEqual(rows.find((r) => r.key === "dimensions")?.values, ["20 × 30,5 × 10 cm", null]);
  });

  it("los grupos salen en orden fijo (General, Audio…, al final envío) y adentro lo compartido primero", () => {
    const table = buildSpecTable([
      { specifications: [{ label: "Shipping Weight", value: "3 lb" }, { label: "Tweeter", value: "1\"" }, { label: "Color", value: "Blanco" }, { label: "Woofer", value: "6.5\"" }] },
      { specifications: [{ label: "Woofer", value: "8\"" }, { label: "Color", value: "Blanco" }] },
    ]);
    assert.deepEqual(table.groups.map((g) => g.name), ["General", "Audio", "Envío y embalaje"]);
    assert.deepEqual(table.groups[1].rows.map((r) => r.key), ["woofer", "tweeter"]);
  });
});
