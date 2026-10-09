import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoomBrief } from "./brief";
import { INTEGRATION_SEED } from "./integrations";
import { runSystemCheck, type CheckDevice } from "./system-check";
import { deriveSystemSpec } from "./system-specs";

function brief(over: Partial<RoomBrief> = {}): RoomBrief {
  return {
    version: 1,
    systems: ["audio"],
    control: "none",
    vcPlatform: null,
    audio: { speakerStyle: "wall", use: "music", zones: 1, speakers: 4, streaming: false },
    video: null,
    brands: {},
    tier: "recomendado",
    notes: null,
    ...over,
  };
}

const speakers = (quantity: number): CheckDevice => ({
  slotKey: "speakers",
  role: "speaker",
  label: "Parlantes",
  quantity,
  product: { id: "sp", name: "VP62R", brandSlug: "sonance", brandName: "SONANCE" },
  spec: deriveSystemSpec({ name: "VP62R", brandSlug: "sonance", designRole: "speaker", ai: { productType: "speaker", powerWatts: 100, impedanceOhms: 8 } }),
});

const amp = (name: string, brandSlug = "blaze-by-sonance", quantity = 1): CheckDevice => ({
  slotKey: "amplifier",
  role: "processor",
  label: "Amplificador",
  quantity,
  product: { id: name, name, brandSlug, brandName: brandSlug.toUpperCase() },
  spec: deriveSystemSpec({ name, brandSlug, designRole: "processor" }),
});

test("sin amplificador: error y pide los canales necesarios", () => {
  const f = runSystemCheck([speakers(4)], brief(), []);
  const missing = f.find((x) => x.id === "amp-missing");
  assert.equal(missing?.level, "error");
  assert.equal(missing?.suggestion?.kind === "amplifier" && missing.suggestion.minChannels, 2);
});

test("8 parlantes en 4 zonas con un amplificador de 2 canales: faltan canales", () => {
  const f = runSystemCheck([speakers(8), amp("PowerZone Connect 122")], brief({ audio: { speakerStyle: "ceiling", use: "music", zones: 4, speakers: 8, streaming: false } }), []);
  const e = f.find((x) => x.id === "amp-channels");
  assert.equal(e?.level, "error");
  assert.match(e?.title ?? "", /Faltan 2 canales/);
  assert.ok(e?.suggestion?.kind === "amplifier" && e.suggestion.sameQuantity === 2);
});

test("4 parlantes con PowerZone Connect 254: alcanza", () => {
  const f = runSystemCheck([speakers(4), amp("PowerZone Connect 254")], brief(), []);
  assert.equal(f.find((x) => x.id === "amp-ok")?.level, "ok");
  assert.ok(!f.some((x) => x.level === "error"));
});

test("amplificador sin datos: pide cargar canales", () => {
  const f = runSystemCheck([speakers(4), amp("AMP-X300", "crestron")], brief(), []);
  assert.equal(f[0].level, "warn");
  assert.match(f[0].title, /Faltan los canales/);
});

test("Crestron Home: Blaze Connect por driver IP + sugiere switch; PowerZone sin Connect avisa", () => {
  const b = brief({ systems: ["audio", "control"], control: "crestron-home" });
  const ok = runSystemCheck([speakers(4), amp("PowerZone Connect 254")], b, INTEGRATION_SEED);
  assert.ok(ok.some((x) => x.id === "ctl-ok-amplifier" && /Driver por red/.test(x.detail)));
  assert.ok(ok.some((x) => x.id === "net-switch"));
  const none = runSystemCheck([speakers(4), amp("PowerZone 254")], b, INTEGRATION_SEED);
  assert.equal(none.find((x) => x.id === "ctl-none-amplifier")?.level, "warn");
});

test("marca sin regla: avisa que falta cargar la integración", () => {
  const b = brief({ systems: ["audio", "control"], control: "crestron-pro" });
  const f = runSystemCheck([speakers(2), amp("SA202-II", "soundtube")], b, INTEGRATION_SEED);
  assert.ok(f.some((x) => x.id === "ctl-unknown-amplifier"));
});

test("streaming pedido y no resuelto", () => {
  const b = brief({ audio: { speakerStyle: "wall", use: "music", zones: 1, speakers: 2, streaming: true } });
  const f = runSystemCheck([speakers(2), amp("PowerZone Connect 122")], b, []);
  assert.equal(f.find((x) => x.id === "stream-missing")?.level, "warn");
  const solved = runSystemCheck([speakers(2), amp("DM-NAX-AMP-X300", "crestron")], b, []);
  assert.ok(solved.some((x) => x.id === "stream-ok"));
});

test("ambiente con audio central: no pide amplificador propio", () => {
  const speaker = {
    slotKey: "speakers",
    role: "speaker",
    label: "Parlantes",
    quantity: 6,
    product: { id: "p1", name: "VX60R", brandSlug: "sonance", brandName: "Sonance" },
    spec: null,
  };
  const findings = runSystemCheck([speaker as CheckDevice], brief({ centralized: { audio: true, control: true } }), []);
  assert.equal(findings[0]?.id, "amp-central");
});
