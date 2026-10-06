/**
 * Vidriera de la pantalla del stand: productos principales y relevantes de
 * cada marca, alternando marcas, sin accesorios ni partes.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isAccessoryLike, pickShowcase, type ShowcaseCandidate } from "./showcase";

const c = (id: string, brand: string, score: number, name = id): ShowcaseCandidate => ({
  id, brand, name, imageUrl: `https://img/${id}.png`, score,
});

describe("isAccessoryLike", () => {
  it("detecta ropa y merchandising", () => {
    for (const n of ["SONANCE-JLS WVNECK BLK", "James T-Shirt Black", "Sonance Hoodie Grey", "TRUFIG Beanie", "IPAD 10.2 - 10.5 1/2\" GYPSUM M"]) {
      assert.equal(isAccessoryLike(n), true, n);
    }
  });

  it("detecta accesorios por nombre", () => {
    for (const n of ["SA4 GRILLE RND", "RACK MOUNT BRACKET FOR X", "1/2IN GYP MP AS", "TRIM KIT", "ROUTER TEMPLATE", "Hanging Cable PAIR", "Backplate for CMi"]) {
      assert.equal(isAccessoryLike(n), true, n);
    }
  });
  it("deja pasar equipos", () => {
    for (const n of ["DSP 2-150 MKIII", "VP82R", "TSW-1070-B-S", "CM31-EZ-BK", "BLOCKROCK-ML"]) {
      assert.equal(isAccessoryLike(n), false, n);
    }
  });
});

describe("pickShowcase", () => {
  const items = [
    c("a1", "A", 9), c("a2", "A", 8), c("a3", "A", 7), c("a4", "A", 6),
    c("b1", "B", 5), c("b2", "B", 4),
    c("c1", "C", 3),
    c("x", "A", 100, "WALL BRACKET"),
  ];
  it("toma los mejores por marca, alterna marcas y excluye accesorios", () => {
    const picked = pickShowcase(items, { perBrand: 3, limit: 10 }).map((p) => p.id);
    assert.deepEqual(picked, ["a1", "b1", "c1", "a2", "b2", "a3"]);
  });
  it("respeta el límite total", () => {
    assert.equal(pickShowcase(items, { perBrand: 3, limit: 4 }).length, 4);
  });
  it("descarta sin imagen", () => {
    const noImg = { ...c("n", "N", 50), imageUrl: "" };
    assert.deepEqual(pickShowcase([noImg], { perBrand: 3, limit: 5 }), []);
  });
});
