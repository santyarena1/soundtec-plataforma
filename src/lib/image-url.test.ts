import { test } from "node:test";
import assert from "node:assert/strict";
import { optimizedImage } from "./image-url";

test("las fotos externas se piden achicadas al optimizador", () => {
  assert.equal(
    optimizedImage("https://embed.widencdn.net/img/crestron/x/2500px@1x/a.png", 384),
    "/_next/image?url=https%3A%2F%2Fembed.widencdn.net%2Fimg%2Fcrestron%2Fx%2F2500px%401x%2Fa.png&w=384&q=75"
  );
});

test("rutas propias, data: y vacíos quedan igual", () => {
  assert.equal(optimizedImage("/api/brand-logo/abc", 96), "/api/brand-logo/abc");
  assert.equal(optimizedImage("data:image/png;base64,AAA", 96), "data:image/png;base64,AAA");
  assert.equal(optimizedImage(null, 96), null);
  assert.equal(optimizedImage("", 96), null);
});

test("fotos de dominios fuera de la lista se muestran directo, sin el optimizador", () => {
  assert.equal(optimizedImage("https://sitio-cualquiera.example/foto.jpg", 384), "https://sitio-cualquiera.example/foto.jpg");
  assert.ok(optimizedImage("https://abc.public.blob.vercel-storage.com/x.png", 96)?.startsWith("/_next/image"));
});
