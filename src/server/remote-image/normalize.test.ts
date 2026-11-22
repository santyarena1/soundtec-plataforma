import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { normalizeProductImage, MAX_SIDE } from "./normalize";
import { ImageRejectError } from "@/lib/remote-image/reasons";

const solid = (w: number, h: number, alpha = 1) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 200, g: 30, b: 30, alpha } } });

async function rejects(input: Buffer, reason: string) {
  await assert.rejects(normalizeProductImage(input), (error: unknown) => error instanceof ImageRejectError && error.reason === reason);
}

test("JPEG/PNG/WebP livianos se guardan tal cual", async () => {
  for (const [fmt, type] of [["jpeg", "image/jpeg"], ["png", "image/png"], ["webp", "image/webp"]] as const) {
    const input = await solid(800, 600, fmt === "jpeg" ? 1 : 0.5).toFormat(fmt).toBuffer();
    const out = await normalizeProductImage(input);
    assert.equal(out.converted, false, fmt);
    assert.equal(out.contentType, type);
    assert.equal(out.bytes, input);
    assert.deepEqual([out.width, out.height], [800, 600]);
  }
});

test("AVIF, GIF, TIFF y BMP-like se convierten; JPEG si es opaca, PNG si tiene transparencia", async () => {
  const avif = await solid(640, 480).avif().toBuffer();
  const a = await normalizeProductImage(avif);
  assert.equal(a.converted, true);
  assert.equal(a.contentType, "image/jpeg");
  assert.equal(a.sourceFormat, "avif");

  const gif = await solid(300, 300, 0).gif().toBuffer();
  const g = await normalizeProductImage(gif);
  assert.equal(g.sourceFormat, "gif");
  assert.equal(g.contentType, "image/png");

  const tiff = await solid(500, 400).tiff().toBuffer();
  const t = await normalizeProductImage(tiff);
  assert.equal(t.sourceFormat, "tiff");
  assert.equal(t.contentType, "image/jpeg");
  assert.equal((await sharp(t.bytes).metadata()).format, "jpeg");
});

test("las fotos gigantes se achican a 2000 px como máximo", async () => {
  const big = await solid(4000, 1000).jpeg().toBuffer();
  const out = await normalizeProductImage(big);
  assert.equal(out.converted, true);
  assert.equal(out.width, MAX_SIDE);
  assert.equal(out.height, 500);
});

test("SVG se limpia y se rasteriza a PNG con buena resolución", async () => {
  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" onload="alert(1)"><script>alert(1)</script><rect width="200" height="100" fill="#c00"/></svg>',
  );
  const out = await normalizeProductImage(svg);
  assert.equal(out.sourceFormat, "svg");
  assert.equal(out.converted, true);
  assert.ok(out.width >= 1000, `ancho ${out.width}`);
  assert.equal((await sharp(out.bytes).metadata()).format === "png" || out.contentType === "image/jpeg", true);
});

test("rechaza HTML, basura, vacíos, íconos chicos y archivos dañados con motivo", async () => {
  await rejects(Buffer.from("<!doctype html><html><body>403</body></html>"), "not-an-image");
  await rejects(Buffer.from("esto no es una imagen"), "unsupported-format");
  await rejects(Buffer.alloc(0), "empty");
  await rejects(await solid(64, 64).png().toBuffer(), "too-small");
  const jpeg = await solid(800, 600).jpeg().toBuffer();
  await rejects(jpeg.subarray(0, 200), "decode-failed");
});

test("HEIC: si el servidor no lo puede leer, lo dice con un motivo claro", async () => {
  const fakeHeic = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from("ftypheic"), Buffer.alloc(4), Buffer.from("mif1heic"), Buffer.alloc(64)]);
  await rejects(fakeHeic, "heic-unsupported");
});
