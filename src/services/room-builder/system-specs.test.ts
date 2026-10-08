import { test } from "node:test";
import assert from "node:assert/strict";
import { channelsNeeded, deriveSystemSpec } from "./system-specs";

const amp = (name: string, brandSlug = "blaze-by-sonance") => deriveSystemSpec({ name, brandSlug, designRole: "processor" });

test("Blaze PowerZone: canales y watts desde el modelo", () => {
  assert.deepEqual([amp("PowerZone Connect 254").channels, amp("PowerZone Connect 254").wattsPerChannel], [4, 250]);
  assert.deepEqual([amp("PowerZone Connect 122").channels, amp("PowerZone Connect 122").wattsPerChannel], [2, 125]);
  assert.deepEqual([amp("PowerZone Connect 504D").channels, amp("PowerZone Connect 504D").wattsPerChannel], [4, 500]);
  assert.deepEqual([amp("PowerZone 1004").channels, amp("PowerZone 1004").wattsPerChannel], [4, 1000]);
  const pro = amp("PowerZone Connect PRO 600.4");
  assert.deepEqual([pro.channels, pro.wattsPerChannel], [4, 150]);
  assert.equal(amp("PowerZone Connect 122").networked, true);
});

test("Sonance y Crestron: canales-watts", () => {
  const sonamp = amp("SONAMP 2-100", "sonance");
  assert.deepEqual([sonamp.kind, sonamp.channels, sonamp.wattsPerChannel], ["amplifier", 2, 100]);
  assert.deepEqual([amp("DSP 8-130 MKIII", "sonance").channels, amp("DSP 8-130 MKIII", "sonance").wattsPerChannel], [8, 130]);
  assert.deepEqual([amp("AMP-8150", "crestron").channels, amp("AMP-8150", "crestron").wattsPerChannel], [8, 150]);
  assert.equal(amp("DM-NAX-8ZSA", "crestron").streaming, true);
});

test("sin datos legibles queda en null (se completa a mano)", () => {
  const unknown = amp("AMP-X300", "crestron");
  assert.equal(unknown.kind, "amplifier");
  assert.equal(unknown.channels, null);
});

test("parlantes toman watts e impedancia del perfil de IA; 70 V se detecta", () => {
  const sp = deriveSystemSpec({ name: "VP62R", brandSlug: "sonance", designRole: "speaker", ai: { productType: "speaker", powerWatts: 100, impedanceOhms: 8 } });
  assert.deepEqual([sp.kind, sp.wattsPerChannel, sp.nominalOhms], ["speaker", 100, 8]);
  assert.equal(deriveSystemSpec({ name: "CS-C6T 70V", brandSlug: "soundtube", designRole: "speaker" }).highImpedance, true);
});

test("canales necesarios: 2 parlantes de 8 Ω por canal si el amplificador banca 4 Ω", () => {
  assert.equal(channelsNeeded(4, 1, { minOhms: 4 }, 8), 2);
  assert.equal(channelsNeeded(4, 1, { minOhms: null }, 8), 4);
  assert.equal(channelsNeeded(4, 3, { minOhms: 4 }, 8), 3);
  assert.equal(channelsNeeded(0, 1, null, null), 0);
});
