import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { brandLogoSrc, isDataUrl, parseLogoDataUrl } from "./brand-logo";

describe("brandLogoSrc", () => {
  it("todos los logos pasan por la API, que los normaliza", () => {
    assert.match(brandLogoSrc({ id: "b1", logoUrl: "data:image/png;base64,AAA=" }) ?? "", /^\/api\/brand-logo\/b1\?v=[a-z0-9]+$/);
    assert.match(brandLogoSrc({ id: "b1", logoUrl: "https://x.com/logo.svg" }) ?? "", /^\/api\/brand-logo\/b1\?v=[a-z0-9]+$/);
  });
  it("cambiar el logo cambia la URL (rompe la caché)", () =>
    assert.notEqual(brandLogoSrc({ id: "b1", logoUrl: "https://x.com/a.png" }), brandLogoSrc({ id: "b1", logoUrl: "https://x.com/b.png" })));
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
