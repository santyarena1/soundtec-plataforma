import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { optimizedImageUrl } from "./optimized-image";

describe("optimizedImageUrl", () => {
  it("pide un WebP del ancho de una tarjeta retina", () => {
    const url = optimizedImageUrl("https://cdn.example.com/a.png?v=1", 700, 75);
    const params = new URL(url, "https://portal.local").searchParams;
    assert.equal(url.startsWith("/_next/image?"), true);
    assert.equal(params.get("url"), "https://cdn.example.com/a.png?v=1");
    assert.equal(params.get("w"), "750");
    assert.equal(params.get("q"), "75");
  });

  it("no agranda por encima del ancho pedido si ya hay uno permitido", () => {
    assert.equal(new URL(optimizedImageUrl("https://cdn.example.com/a.jpg", 96), "https://x").searchParams.get("w"), "96");
  });

  it("deja pasar svg, data y lo que ya está optimizado", () => {
    assert.equal(optimizedImageUrl("https://cdn.example.com/a.svg", 640), "https://cdn.example.com/a.svg");
    assert.equal(optimizedImageUrl("data:image/png;base64,aaa", 640), "data:image/png;base64,aaa");
    const ready = "/_next/image?url=https%3A%2F%2Fx&w=640&q=75";
    assert.equal(optimizedImageUrl(ready, 640), ready);
  });
});
