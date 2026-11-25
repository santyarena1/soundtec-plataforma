import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeVideoUrl, videoEmbedUrl, videoThumbnailUrl } from "./product-video";

const YT = "dQw4w9WgXcQ";

test("YouTube: watch, youtu.be, shorts, embed, móvil y sin https quedan en el mismo link canónico", () => {
  for (const raw of [
    `https://www.youtube.com/watch?v=${YT}`,
    `https://youtube.com/watch?v=${YT}&t=42s&list=PL123`,
    `https://m.youtube.com/watch?v=${YT}`,
    `https://youtu.be/${YT}?si=abc`,
    `https://www.youtube.com/shorts/${YT}`,
    `https://www.youtube.com/embed/${YT}`,
    `www.youtube.com/watch?v=${YT}`,
    `  youtu.be/${YT}  `,
  ]) {
    const r = normalizeVideoUrl(raw);
    assert.ok(r.ok, raw);
    if (r.ok) {
      assert.equal(r.provider, "youtube");
      assert.equal(r.videoId, YT);
      assert.equal(r.url, `https://www.youtube.com/watch?v=${YT}`);
    }
  }
});

test("Instagram: post, reel, reels, tv y con usuario adelante", () => {
  for (const raw of [
    "https://www.instagram.com/p/C1a2B3c4D5e/",
    "https://instagram.com/reel/C1a2B3c4D5e/?igsh=xyz",
    "https://www.instagram.com/reels/C1a2B3c4D5e",
    "https://www.instagram.com/tv/C1a2B3c4D5e/",
    "https://www.instagram.com/soundtec/reel/C1a2B3c4D5e/",
  ]) {
    const r = normalizeVideoUrl(raw);
    assert.ok(r.ok, raw);
    if (r.ok) {
      assert.equal(r.provider, "instagram");
      assert.equal(r.videoId, "C1a2B3c4D5e");
      assert.equal(r.url, "https://www.instagram.com/p/C1a2B3c4D5e/");
    }
  }
});

test("rechaza links que no son de video o de otros sitios", () => {
  for (const raw of [
    "",
    "hola",
    "https://vimeo.com/123456",
    "https://www.youtube.com/channel/UC123",
    "https://www.youtube.com/watch?v=corto",
    "https://www.instagram.com/soundtec/",
    "https://evil.com/youtube.com/watch?v=" + YT,
    "https://youtube.com.evil.com/watch?v=" + YT,
    "javascript:alert(1)",
    "ftp://youtu.be/" + YT,
  ]) {
    assert.equal(normalizeVideoUrl(raw).ok, false, raw);
  }
});

test("el reproductor va por youtube-nocookie y el embed de Instagram; ids inválidos no arman URL", () => {
  assert.equal(videoEmbedUrl({ provider: "youtube", videoId: YT }), `https://www.youtube-nocookie.com/embed/${YT}?autoplay=1&rel=0`);
  assert.equal(videoEmbedUrl({ provider: "instagram", videoId: "C1a2B3c4D5e" }), "https://www.instagram.com/p/C1a2B3c4D5e/embed/");
  assert.equal(videoEmbedUrl({ provider: "youtube", videoId: "x\"><script>" }), null);
  assert.equal(videoThumbnailUrl({ provider: "instagram", videoId: "C1a2B3c4D5e" }), null);
  assert.equal(videoThumbnailUrl({ provider: "youtube", videoId: YT }), `https://i.ytimg.com/vi/${YT}/hqdefault.jpg`);
});
