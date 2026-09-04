import assert from "node:assert/strict";
import { resolveSonanceMyPrice } from "./sonance-portal";

// Caso real SKU 93802: My Price 768, wholesale/list 960.
assert.equal(
  resolveSonanceMyPrice({
    pricing: { unitNetPrice: 768, unitListPrice: 960 },
    unitListPrice: 960,
    listingPrice: 960,
    basicListPrice: 960,
  }),
  768
);

// Sin My Price no inventamos wholesale.
assert.equal(
  resolveSonanceMyPrice({
    pricing: { unitListPrice: 960 },
    unitListPrice: 960,
    listingPrice: 960,
    basicListPrice: 960,
  }),
  undefined
);

assert.equal(resolveSonanceMyPrice({ pricing: null }), undefined);
assert.equal(resolveSonanceMyPrice({ pricing: { unitNetPrice: 0 } }), undefined);

console.log("sonance-portal-price.test.ts OK");
