import { test } from "node:test";
import assert from "node:assert/strict";
import {
  applyBriefToSlots,
  normalizeBrief,
  platformFromBrief,
  preferredBrandsForSlot,
  rankModeForTier,
  suggestSpeakerCount,
  type RoomBrief,
} from "./brief";
import { layoutSlotsForTemplate } from "./slot-layout";

const dims = { widthM: 6, depthM: 5, heightM: 2.7 };

function brief(over: Partial<RoomBrief> = {}): RoomBrief {
  return {
    version: 1,
    systems: ["audio"],
    control: "none",
    vcPlatform: null,
    audio: { speakerStyle: "wall", use: "music", zones: 1, speakers: 4, streaming: true },
    video: null,
    brands: {},
    tier: "recomendado",
    notes: null,
    ...over,
  };
}

test("solo audio: saca pantallas, cámaras y control; agrega amplificador", () => {
  const base = layoutSlotsForTemplate("residential-living-m", dims.widthM, dims.depthM, dims.heightM);
  const slots = applyBriefToSlots(base, brief(), dims);
  assert.ok(!slots.some((s) => s.role === "display"));
  assert.ok(!slots.some((s) => s.role === "touch"));
  assert.ok(!slots.some((s) => s.role === "processor" && s.key !== "amplifier"));
  const speakers = slots.find((s) => s.role === "speaker");
  assert.equal(speakers?.mount, "wall");
  assert.equal(speakers?.defaultQty, 4);
  assert.equal(speakers?.label, "Parlantes de pared");
  assert.ok(slots.some((s) => s.key === "amplifier" && s.role === "processor"));
});

test("parlantes de pared van a una pared, no al techo", () => {
  const base = layoutSlotsForTemplate("residential-living-m", dims.widthM, dims.depthM, dims.heightM);
  const speakers = applyBriefToSlots(base, brief(), dims).find((s) => s.role === "speaker");
  assert.ok(speakers && speakers.pose.y < dims.heightM - 0.2);
});

test("con Crestron Home e iluminación agrega procesador, panel y teclas", () => {
  const slots = applyBriefToSlots([], brief({ systems: ["audio", "control", "lighting"], control: "crestron-home" }), dims);
  assert.ok(slots.some((s) => s.key === "processor" && s.label.includes("Crestron Home")));
  assert.ok(slots.some((s) => s.role === "touch" && s.key === "touch"));
  assert.ok(slots.some((s) => s.key === "lighting_keypad"));
});

test("videoconferencia conserva cámara, micrófono y códec", () => {
  const base = layoutSlotsForTemplate("vc-meeting-m", dims.widthM, dims.depthM, dims.heightM);
  const slots = applyBriefToSlots(base, brief({ systems: ["vc"], vcPlatform: "teams", audio: null }), dims);
  for (const role of ["camera", "mic", "codec", "display"]) assert.ok(slots.some((s) => s.role === role), role);
});

test("cantidad sugerida: pares, mínimo 2 y crece con el área", () => {
  assert.equal(suggestSpeakerCount(10, "background"), 2);
  assert.equal(suggestSpeakerCount(60, "music"), 10);
  assert.equal(suggestSpeakerCount(20, "music", 3), 6);
  assert.equal(suggestSpeakerCount(40, "cinema"), 7);
});

test("plataforma y orden del ranking salen de las respuestas", () => {
  assert.equal(platformFromBrief(brief({ systems: ["vc"], vcPlatform: "zoom" })), "zoom");
  assert.equal(platformFromBrief(brief({ systems: ["audio", "control"], control: "crestron-home" })), "crestron-home");
  assert.equal(platformFromBrief(brief()), "none");
  assert.equal(rankModeForTier("esencial"), "price_asc");
  assert.equal(rankModeForTier("premium"), "premium");
});

test("marcas preferidas por tipo de equipo", () => {
  const b = brief({ brands: { audio: ["sonance"], amplification: ["blaze"], control: ["crestron"] } });
  assert.deepEqual(preferredBrandsForSlot(b, "speaker", "speakers"), ["sonance"]);
  assert.deepEqual(preferredBrandsForSlot(b, "processor", "amplifier"), ["blaze"]);
  assert.deepEqual(preferredBrandsForSlot(b, "processor", "processor"), ["crestron"]);
  assert.deepEqual(preferredBrandsForSlot(null, "speaker", "speakers"), []);
});

test("normalizeBrief limpia datos inválidos", () => {
  assert.equal(normalizeBrief({ systems: [] }), null);
  const b = normalizeBrief({
    systems: ["audio", "nope"],
    control: "x",
    audio: { speakerStyle: "wall", use: "music", zones: 99, speakers: 500 },
    brands: { audio: ["sonance", "BAD SLUG"], foo: ["x"] },
    tier: "premium",
  });
  assert.ok(b);
  assert.deepEqual(b.systems, ["audio"]);
  assert.equal(b.control, "none");
  assert.equal(b.audio?.zones, 24);
  assert.equal(b.audio?.speakers, 48);
  assert.deepEqual(b.brands, { audio: ["sonance"] });
  assert.equal(b.tier, "premium");
});

test("Reparar 3D y el rearmado respetan el relevamiento", async () => {
  const { buildSceneFromTemplate } = await import("./scene");
  const { getRoomTemplate } = await import("./templates");
  const { hydrateRoomScene, rebuildSceneKeepingProducts } = await import("./hydrate-scene");
  const template = getRoomTemplate("residential-living-m");
  assert.ok(template);
  const b = brief();
  const slots = applyBriefToSlots(layoutSlotsForTemplate(template.key, dims.widthM, dims.depthM, dims.heightM), b, dims);
  const scene = { ...buildSceneFromTemplate({ ...template, slots }), ...dims, areaM2: 30, brief: b };

  const repaired = rebuildSceneKeepingProducts(scene, template.key);
  assert.ok(!repaired.slots.some((s) => s.role === "display"));
  assert.ok(repaired.slots.some((s) => s.key === "amplifier"));

  const hydrated = hydrateRoomScene(scene, { templateKey: template.key, force: true }).scene;
  assert.ok(!hydrated.slots.some((s) => s.role === "display"));
  assert.equal(hydrated.slots.find((s) => s.role === "speaker")?.mount, "wall");
});
