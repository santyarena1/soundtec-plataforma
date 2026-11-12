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

test("parlantes de 4 Ω: canales por carga real y el texto dice la impedancia de verdad", () => {
  const four: CheckDevice = { ...speakers(4), spec: deriveSystemSpec({ name: "Parlante 4", brandSlug: "x", designRole: "speaker", ai: { productType: "speaker", powerWatts: 100, impedanceOhms: 4 } }) };
  const f = runSystemCheck([four, amp("PowerZone Connect 122")], brief(), []);
  const e = f.find((x) => x.id === "amp-channels");
  assert.equal(e?.level, "error", "4 parlantes de 4 Ω necesitan 4 canales y hay 2");
  assert.match(e!.detail, /1 parlante de 4 Ω por canal/);
});

test("dato faltante: se calcula con un típico y queda el aviso de dato estimado", () => {
  const noOhms: CheckDevice = { ...speakers(4), spec: deriveSystemSpec({ name: "Parlante", brandSlug: "x", designRole: "speaker", ai: { productType: "speaker", powerWatts: 100 } }) };
  const f = runSystemCheck([noOhms, amp("PowerZone Connect 254")], brief(), []);
  const est = f.find((x) => x.id === "amp-estimated");
  assert.equal(est?.level, "warn");
  assert.match(est!.detail, /dato estimado: impedancia de los parlantes: 8 Ω típico/);
  assert.match(est!.detail, /dato estimado: carga mínima de .*supuesta por el modelo/);
});

test("70 V: canales por potencia de la línea (taps por defecto, marcados como estimados)", () => {
  const line: CheckDevice = { ...speakers(20), spec: deriveSystemSpec({ name: "CM62 70V", brandSlug: "soundtube", designRole: "speaker" }) };
  const amp70: CheckDevice = { ...amp("Amplificador 70V 2x60W", "x"), spec: { ...deriveSystemSpec({ name: "Amplificador 70V 2x60W", brandSlug: "x", designRole: "processor" }), highImpedance: true } };
  const f = runSystemCheck([line, amp70], brief(), []);
  // 20 × 5 W = 100 W; 48 W útiles por canal → 3 canales y el equipo da 2.
  assert.match(f.find((x) => x.id === "amp-channels")?.title ?? "", /Falta 1 canal/);
  assert.match(f.find((x) => x.id === "amp-estimated")!.detail, /tap de 5 W por parlante/);
});
