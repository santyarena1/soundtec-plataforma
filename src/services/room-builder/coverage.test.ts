import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyCoverageOverride,
  cameraCoverageFit,
  displayViewingFit,
  labelFromFit,
  micCoverageFit,
  viewingDistanceFromDiagonalIn,
} from "./coverage";

describe("applyCoverageOverride", () => {
  it("permite ajuste dentro de banda y bloquea extremos", () => {
    const base = { source: "datasheet" as const, hfovDeg: 80, maxRangeM: 8 };
    const mild = applyCoverageOverride("camera", base, { hfovDeg: 90 });
    assert.equal(mild.hfovDeg, 90);
    assert.equal(mild.source, "project_override");

    const wild = applyCoverageOverride("camera", base, { hfovDeg: 160 });
    assert.ok((wild.hfovDeg ?? 0) <= 96); // 80 * 1.2
  });
});

describe("cameraCoverageFit", () => {
  it("devuelve null sin FOV (no inventa)", () => {
    assert.equal(cameraCoverageFit({ hfovDeg: null, maxRangeM: 10, targetWidthM: 3, distanceM: 4 }), null);
  });

  it("puntúa bien un FOV que cubre la mesa", () => {
    const fit = cameraCoverageFit({
      hfovDeg: 90,
      maxRangeM: 10,
      targetWidthM: 3,
      distanceM: 2.2,
    });
    assert.ok(fit != null && fit >= 0.75);
  });
});

describe("micCoverageFit / displayViewingFit", () => {
  it("mic óptimo cerca del radio de zona", () => {
    assert.equal(labelFromFit(micCoverageFit({ radiusM: 3, zoneRadiusM: 2.8 })), "optimal");
  });

  it("display dentro de rango", () => {
    const fit = displayViewingFit({ viewMinM: 1.5, viewMaxM: 4, seatingDistanceM: 2.5 });
    assert.equal(fit, 1);
  });
});

describe("viewingDistanceFromDiagonalIn", () => {
  it("escala con pulgadas", () => {
    const a = viewingDistanceFromDiagonalIn(55);
    const b = viewingDistanceFromDiagonalIn(75);
    assert.ok(b.viewMaxM > a.viewMaxM);
  });
});
