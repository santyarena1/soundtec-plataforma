import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyCable, isCableProduct, lengthOf, pickCables, type CableProduct } from "./cable-picks";
import type { CableLink, CablingPlan } from "./cabling";

const link = (signal: CableLink["signal"], cableM: number, note?: string): CableLink => ({ id: `${signal}${cableM}${Math.random()}`, from: "a", to: "b", signal, fromPort: "", toPort: "", route: [], runM: cableM, cableM, ...(note ? { note } : {}) });
const plan = (links: CableLink[]): CablingPlan => ({ nodes: [], links, findings: [], totals: [], missing: [] });

test("clasifica cables del catálogo por señal, tipo y largo (pies a metros)", () => {
  const hdmi = classifyCable({ id: "1", name: "C-HM/HM-15", brand: "Kramer", text: "High-Speed HDMI cable 15 ft", priceUsd: 20 });
  assert.equal(hdmi?.signal, "hdmi");
  assert.equal(hdmi?.lengthM, 4.6);
  const reel = classifyCable({ id: "2", name: "FT2A-CBLR-1T-CAT6", brand: "Crestron", text: "CAT6 cable reel 1000 ft", priceUsd: 305 });
  assert.equal(reel?.signal, "utp");
  assert.equal(reel?.kind, "bulk");
  assert.equal(reel?.lengthM, 304.8);
  assert.equal(classifyCable({ id: "3", name: "Soporte de pared", brand: null, text: "bracket", priceUsd: 10 }), null);
  assert.equal(lengthOf("cable hdmi 3 metros"), 3);
});

test("elige el cable armado más corto que alcanza, óptico en tramos largos, y rollos por metros", () => {
  const catalog: CableProduct[] = [
    { id: "h3", name: "HDMI 3m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 3, extended: false, priceUsd: 10 },
    { id: "h5", name: "HDMI 5m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 5, extended: false, priceUsd: 14 },
    { id: "h15o", name: "HDMI óptico 15m", brand: "X", signal: "hdmi", kind: "patch", lengthM: 15, extended: true, priceUsd: 90 },
    { id: "cat6", name: "Cat6 305m", brand: "X", signal: "utp", kind: "bulk", lengthM: 305, extended: false, priceUsd: 150 },
  ];
  const r = pickCables(plan([link("hdmi", 5), link("hdmi", 2), link("hdmi", 15, "Usar HDMI óptico"), link("lan", 200), link("dante", 150), link("speaker", 40)]), catalog);
  const qty = (id: string) => r.lines.find((l) => l.product.id === id)?.quantity ?? 0;
  assert.equal(qty("h5"), 1);
  assert.equal(qty("h3"), 1);
  assert.equal(qty("h15o"), 1);
  assert.equal(qty("cat6"), 2);
  assert.ok(r.missing.some((m) => m.signal === "speaker"));
});

test("solo son cables los productos que lo son (no el parlante Blaze CBL523)", () => {
  assert.equal(isCableProduct("CBL523-PAS-B", "speaker"), false);
  assert.equal(isCableProduct("CBL523 U-Bracket Kit-B", "mount"), false);
  assert.equal(isCableProduct("DM-CBL-ULTRA-PC-20", "cable"), true);
  assert.equal(isCableProduct("Cable MLX-USB-C 160mm", null), true);
  assert.equal(isCableProduct("CBL-8K-HD-6", null), true);
  assert.equal(isCableProduct("Speaker cable kit amplifier", null), false);
});

test("un cable UTP de Crestron que menciona HDMI en la ficha sigue siendo UTP", () => {
  const c = classifyCable({ id: "x", name: "DM-CBL-ULTRA-PC-20", brand: "Crestron", text: "CAT6A patch cord for HDMI over HDBaseT 20 ft", priceUsd: 10 });
  assert.equal(c?.signal, "utp");
  const h = classifyCable({ id: "y", name: "CBL-8K-HD-6", brand: "Crestron", text: "Ultra high speed cable", priceUsd: 10 });
  assert.equal(h?.signal, "hdmi");
});
