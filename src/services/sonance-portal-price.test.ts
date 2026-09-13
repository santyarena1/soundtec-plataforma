import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { resolveSonanceMyPrice } from "./sonance-portal";

describe("resolveSonanceMyPrice", () => {
  it("usa My Price cuando existe", () => {
    assert.equal(
      resolveSonanceMyPrice({
        pricing: { unitNetPrice: 768, unitListPrice: 960 },
        unitListPrice: 960,
        listingPrice: 960,
        basicListPrice: 960,
      }),
      768
    );
  });

  it("no inventa wholesale si no hay My Price", () => {
    assert.equal(
      resolveSonanceMyPrice({
        pricing: { unitListPrice: 960 },
        unitListPrice: 960,
        listingPrice: 960,
        basicListPrice: 960,
      }),
      undefined
    );
  });

  it("ignora pricing vacío o cero", () => {
    assert.equal(resolveSonanceMyPrice({ pricing: null }), undefined);
    assert.equal(resolveSonanceMyPrice({ pricing: { unitNetPrice: 0 } }), undefined);
  });
});
