import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCompatibleWithSlot, rankForSlot, scoreCandidate } from "./ranking";
import type { RankCandidate } from "./types";

function cand(partial: Partial<RankCandidate> & { productId: string }): RankCandidate {
  return {
    designRole: "camera",
    mountOptions: ["wall"],
    priceUsd: 1200,
    stockScore: 0.8,
    coverageFit: 0.9,
    typologyFit: 0.8,
    dataCompleteness: 0.7,
    discontinued: false,
    brandBoost: 0,
    ...partial,
  };
}

describe("isCompatibleWithSlot", () => {
  it("rechaza rol incorrecto y discontinuado", () => {
    const slot = { role: "camera" as const, mount: "wall" as const };
    assert.equal(isCompatibleWithSlot(cand({ productId: "1", designRole: "mic" }), slot).ok, false);
    assert.equal(
      isCompatibleWithSlot(cand({ productId: "2", discontinued: true }), slot).ok,
      false,
    );
    assert.equal(isCompatibleWithSlot(cand({ productId: "3" }), slot).ok, true);
  });
});

describe("rankForSlot", () => {
  it("ordena recomendados con cobertura y precio sin inventar fit", () => {
    const slot = { role: "camera" as const, mount: "wall" as const };
    const ranked = rankForSlot(
      [
        cand({ productId: "cheap-weak", priceUsd: 700, coverageFit: 0.4 }),
        cand({ productId: "balanced", priceUsd: 1200, coverageFit: 0.92 }),
        cand({ productId: "no-fov", priceUsd: 900, coverageFit: null, dataCompleteness: 0.3 }),
        cand({ productId: "wrong", designRole: "display", priceUsd: 500 }),
      ],
      slot,
      "recommended",
    );
    assert.equal(ranked[0].productId, "balanced");
    assert.equal(ranked.find((r) => r.productId === "wrong")?.compatible, false);
    assert.ok((ranked.find((r) => r.productId === "no-fov")?.score ?? 0) > 0);
  });

  it("price_asc pone el más barato compatible primero", () => {
    const ranked = rankForSlot(
      [
        cand({ productId: "a", priceUsd: 2000 }),
        cand({ productId: "b", priceUsd: 800 }),
      ],
      { role: "camera", mount: "wall" },
      "price_asc",
    );
    assert.equal(ranked[0].productId, "b");
  });
});

describe("scoreCandidate", () => {
  it("modo coverage usa solo fit", () => {
    assert.equal(scoreCandidate(cand({ productId: "x", coverageFit: 0.5 }), "coverage"), 50);
    assert.equal(scoreCandidate(cand({ productId: "y", coverageFit: null }), "coverage"), 0);
  });
});
