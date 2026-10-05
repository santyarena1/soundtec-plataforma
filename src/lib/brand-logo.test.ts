import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandLogoSrc, isDataUrl, parseLogoDataUrl } from "./brand-logo";

describe("brandLogoSrc", () => {
  it("los subidos se sirven por la API", () =>
    assert.equal(brandLogoSrc({ id: "b1", logoUrl: "data:image/png;base64,AAA=" }), "/api/brand-logo/b1"));
  it("las URL quedan como están", () =>
    assert.equal(brandLogoSrc({ id: "b1", logoUrl: "https://x.com/logo.svg" }), "https://x.com/logo.svg"));
  it("vacío → null", () => assert.equal(brandLogoSrc({ id: "b1", logoUrl: " " }), null));
});

describe("parseLogoDataUrl", () => {
  it("acepta imágenes permitidas", () => {
    const parsed = parseLogoDataUrl("data:image/svg+xml;base64," + Buffer.from("<svg/>").toString("base64"));
    assert.equal(parsed?.mime, "image/svg+xml");
    assert.equal(parsed?.bytes.toString(), "<svg/>");
  });
  it("rechaza otros tipos", () => {
    assert.equal(parseLogoDataUrl("data:text/html;base64,PGgxPg=="), null);
    assert.equal(parseLogoDataUrl("https://x.com/a.png"), null);
  });
  it("isDataUrl", () => assert.equal(isDataUrl("data:image/png;base64,A"), true));
});
