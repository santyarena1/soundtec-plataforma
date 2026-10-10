import { test } from "node:test";
import assert from "node:assert/strict";
import { displayProxyKey, inchesFromModel, inchesFromName, inchesFromWidthCm, pickForTier, targetDisplayInches } from "./sizing";

test("pantalla según la distancia: sala chica, sala grande, living", () => {
  assert.equal(targetDisplayInches({ depthM: 5 }, "videoconference"), 65);
  assert.equal(targetDisplayInches({ depthM: 3.5 }, "videoconference"), 43);
  assert.equal(targetDisplayInches({ depthM: 8 }, "videoconference"), 98);
  assert.equal(targetDisplayInches({ depthM: 5 }, "residential"), 75);
  assert.equal(targetDisplayInches({ depthM: 30 }, "event"), 98);
});

test("pulgadas desde el nombre o el ancho", () => {
  assert.equal(inchesFromName('Samsung QM65C 65" 4K'), 65);
  assert.equal(inchesFromName("LG 86 pulgadas UR640S"), 86);
  assert.equal(inchesFromName("Parlante de techo 6.5"), null);
  assert.equal(inchesFromWidthCm(145), 65);
  assert.equal(inchesFromWidthCm(12), null);
});

const rows = [
  { productId: "a", compatible: true, score: 60, priceUsd: 900, diagonalIn: 55 },
  { productId: "b", compatible: true, score: 50, priceUsd: 400, diagonalIn: 65 },
  { productId: "c", compatible: true, score: 40, priceUsd: 2500, diagonalIn: 75 },
  { productId: "d", compatible: true, score: 10, priceUsd: 50, diagonalIn: 65 },
  { productId: "e", compatible: false, score: -1, priceUsd: 10, diagonalIn: 65 },
];

test("el nivel elige entre los que pasan el corte de calidad (nunca deja vacío por escala)", () => {
  assert.equal(pickForTier(rows, "recomendado")?.productId, "a");
  assert.equal(pickForTier(rows, "esencial")?.productId, "b", "el más barato de calidad, no el de puntaje 10");
  assert.equal(pickForTier(rows, "premium")?.productId, "c");
  assert.equal(pickForTier([], "recomendado"), null);
});

test("pantallas: se prioriza el tamaño del ambiente", () => {
  assert.equal(pickForTier(rows, "recomendado", { targetInches: 65 })?.productId, "b");
  assert.equal(pickForTier(rows, "premium", { targetInches: 75 })?.productId, "c");
});

test("marcas pedidas primero", () => {
  const withBrand = rows.map((r) => ({ ...r, preferredBrand: r.productId === "c" }));
  assert.equal(pickForTier(withBrand, "esencial")?.productId, "c");
});

test("modelo 3D de la pantalla con sus pulgadas reales", () => {
  assert.equal(displayProxyKey({ diagonalIn: "85" }), "tv_85");
  assert.equal(displayProxyKey({ name: 'TV 43" FHD' }), "tv_43");
  assert.equal(displayProxyKey({ widthCm: 167 }), "tv_75");
  assert.equal(displayProxyKey({}), null);
});

test("pulgadas del código de modelo: solo medidas comerciales", () => {
  assert.equal(inchesFromModel("HT-HV75-Q"), 75);
  assert.equal(inchesFromModel("HT-HVM27-2K"), 27);
  assert.equal(inchesFromModel("HT-HV32-4K"), 32);
  assert.equal(inchesFromModel("HT-HV24-HD"), 24);
  assert.equal(inchesFromModel("DM-NAX-AMP-X300"), null);
  assert.equal(inchesFromModel(null), null);
});

test("pantalla: sin una del tamaño pedido se elige la más cercana, nunca la más barata", () => {
  const rows = [
    { productId: "24", compatible: true, score: 44, priceUsd: 275, diagonalIn: 24 },
    { productId: "55", compatible: true, score: 40, priceUsd: 1025, diagonalIn: 55 },
    { productId: "75", compatible: true, score: 38, priceUsd: 1925, diagonalIn: 75 },
  ];
  assert.equal(pickForTier(rows, "recomendado", { targetInches: 75 })?.productId, "75");
  assert.equal(pickForTier(rows, "esencial", { targetInches: 65 })?.productId, "55");
  // Un cine de 120": la más grande que hay.
  assert.equal(pickForTier(rows, "recomendado", { targetInches: 120 })?.productId, "75");
});
