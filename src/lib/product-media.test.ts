import { test } from "node:test";
import assert from "node:assert/strict";
import { galleryKey, keysWithFirst, mergeGalleryMedia, moveItem, planGalleryOrder, UNSORTED } from "./product-media";

const img = (id: string, extra: Partial<{ isPrimary: boolean; sortOrder: number; createdAt: string }> = {}) => ({
  id,
  url: `https://x/${id}.jpg`,
  alt: null,
  isPrimary: false,
  sortOrder: UNSORTED,
  createdAt: "2026-01-01T00:00:00Z",
  ...extra,
});
const vid = (id: string, extra: Partial<{ sortOrder: number; createdAt: string }> = {}) => ({
  id,
  provider: "youtube",
  videoId: "dQw4w9WgXcQ",
  url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
  title: null,
  sortOrder: UNSORTED,
  createdAt: "2026-01-01T00:00:00Z",
  ...extra,
});

test("sin orden manual: principal primero, después por antigüedad, y los videos al final", () => {
  const out = mergeGalleryMedia(
    [img("a", { createdAt: "2026-01-01T00:00:00Z" }), img("b", { createdAt: "2026-01-02T00:00:00Z", isPrimary: true }), img("c", { createdAt: "2026-01-03T00:00:00Z" })],
    [vid("v", { createdAt: "2025-01-01T00:00:00Z" })]
  );
  assert.deepEqual(out.map(galleryKey), ["image:b", "image:a", "image:c", "video:v"]);
});

test("con orden manual fotos y videos se intercalan y lo nuevo (sin orden) va al final", () => {
  const out = mergeGalleryMedia(
    [img("a", { sortOrder: 2 }), img("b", { sortOrder: 0 }), img("nueva", { isPrimary: false })],
    [vid("v", { sortOrder: 1 })]
  );
  assert.deepEqual(out.map(galleryKey), ["image:b", "video:v", "image:a", "image:nueva"]);
});

test("moveItem no modifica la lista original", () => {
  const list = ["a", "b", "c", "d"];
  assert.deepEqual(moveItem(list, 3, 0), ["d", "a", "b", "c"]);
  assert.deepEqual(moveItem(list, 0, 2), ["b", "c", "a", "d"]);
  assert.deepEqual(moveItem(list, 0, 9), ["a", "b", "c", "d"]);
  assert.deepEqual(list, ["a", "b", "c", "d"]);
});

test("planGalleryOrder: numera en orden y la principal es la primera FOTO aunque arranque un video", () => {
  const plan = planGalleryOrder(["video:v", "image:b", "image:a"], { imageIds: ["a", "b"], videoIds: ["v"] });
  assert.ok(plan);
  assert.deepEqual(plan!.videos, [{ id: "v", sortOrder: 0 }]);
  assert.deepEqual(plan!.images, [
    { id: "b", sortOrder: 1, isPrimary: true },
    { id: "a", sortOrder: 2, isPrimary: false },
  ]);
});

test("planGalleryOrder rechaza listas que no coinciden con la galería", () => {
  const current = { imageIds: ["a", "b"], videoIds: ["v"] };
  assert.equal(planGalleryOrder(["image:a", "image:b"], current), null, "falta el video");
  assert.equal(planGalleryOrder(["image:a", "image:a", "video:v"], current), null, "repetido");
  assert.equal(planGalleryOrder(["image:a", "image:otra", "video:v"], current), null, "de otro producto");
  assert.equal(planGalleryOrder(["image:a", "image:b", "video:v", "video:x"], current), null, "sobra");
});

test("keysWithFirst lleva una foto adelante (Marcar como principal)", () => {
  const items = mergeGalleryMedia([img("a", { sortOrder: 0 }), img("b", { sortOrder: 2 })], [vid("v", { sortOrder: 1 })]);
  assert.deepEqual(keysWithFirst(items, "image:b"), ["image:b", "image:a", "video:v"]);
});
