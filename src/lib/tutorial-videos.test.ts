import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, mergeTutorialVideos, parseDuration, parseTutorialVideos, parseVideosMarkdown } from "./tutorial-videos";

const MD = `# Videos tutoriales

## 01 · Pedí tu cuenta y entrá al portal

- Archivo: \`01-pedir-cuenta.mp4\` (miniatura \`01-pedir-cuenta.jpg\`)
- Duración: 1:47 · Peso: 4.6 MB

**Placa de título:** Pedí tu cuenta y entrá al portal — Cómo se solicita el acceso, qué pasa después y cómo creás tu contraseña.

## 05 · Favoritos

- Archivo: \`05-favoritos.mp4\` (miniatura \`05-favoritos.jpg\`)
- Duración: 0:44 · Peso: 1.8 MB

**Placa de título:** Favoritos — Guardá los productos que usás seguido y tenelos siempre a mano.

## Notas sueltas

Sin archivo: no es un video.
`;

describe("parseVideosMarkdown", () => {
  const list = parseVideosMarkdown(MD);
  it("toma solo las secciones con archivo .mp4, en orden", () => assert.deepEqual(list.map((v) => v.slug), ["01-pedir-cuenta", "05-favoritos"]));
  it("título, descripción de la placa, duración y miniatura", () => {
    assert.equal(list[0]!.title, "Pedí tu cuenta y entrá al portal");
    assert.equal(list[0]!.description, "Cómo se solicita el acceso, qué pasa después y cómo creás tu contraseña.");
    assert.equal(list[0]!.durationSeconds, 107);
    assert.equal(list[0]!.posterFile, "01-pedir-cuenta.jpg");
    assert.equal(list[1]!.order, 5);
  });
});

describe("parseTutorialVideos", () => {
  const ok = { slug: "a", order: 2, title: "A", description: "", durationSeconds: 10, videoUrl: "/a.mp4", posterUrl: "" };
  it("vacío o JSON roto → lista vacía", () => {
    assert.deepEqual(parseTutorialVideos(""), []);
    assert.deepEqual(parseTutorialVideos("{no"), []);
  });
  it("descarta los items inválidos y ordena", () => {
    const raw = JSON.stringify([{ ...ok, slug: "b", order: 1 }, { title: "sin url" }, ok]);
    assert.deepEqual(parseTutorialVideos(raw).map((v) => v.slug), ["b", "a"]);
  });
  it("acepta { videos: [...] }", () => assert.equal(parseTutorialVideos(JSON.stringify({ videos: [ok] })).length, 1));
});

describe("mergeTutorialVideos", () => {
  const source = { slug: "a", order: 1, title: "Nuevo", description: "Desc nueva", durationSeconds: 50, videoFile: "a.mp4", posterFile: "a.jpg", videoUrl: "/v2.mp4", posterUrl: "/p2.jpg" };
  const prev = [{ slug: "a", order: 1, title: "Editado", description: "Editada", durationSeconds: 40, videoUrl: "/v1.mp4", posterUrl: "/p1.jpg" }];
  it("conserva los textos editados y actualiza archivos y duración", () =>
    assert.deepEqual(mergeTutorialVideos([source], prev)[0], { slug: "a", order: 1, title: "Editado", description: "Editada", durationSeconds: 50, videoUrl: "/v2.mp4", posterUrl: "/p2.jpg" }));
  it("--reset-texts vuelve a los de videos.md", () => assert.equal(mergeTutorialVideos([source], prev, { resetTexts: true })[0]!.title, "Nuevo"));
});

describe("duración", () => {
  it("formato m:ss ida y vuelta", () => {
    assert.equal(formatDuration(107), "1:47");
    assert.equal(formatDuration(44), "0:44");
    assert.equal(parseDuration("1:07"), 67);
    assert.equal(parseDuration("x"), null);
  });
});
