import { test } from "node:test";
import assert from "node:assert/strict";
import { aWeighted, ncSpectrum } from "./materials";
import { reverbBands, roomGeometry, rtMid } from "./reverb";
import { resolveAcoustics } from "./settings";
import { ceilingAxes, directivityQ, directSpl, offAxisDb, wallAxes, type SoundSource } from "./source";
import { computeSoundMap } from "./sound-map";
import { stiFromBands, transmissionIndex } from "./sti";
import { coverageRadius, designGrid, designGrids } from "./grid-design";
import { speakerWatts } from "./scene-sources";

const rect = (w: number, d: number) => [
  { x: -w / 2, y: -d / 2 },
  { x: w / 2, y: -d / 2 },
  { x: w / 2, y: d / 2 },
  { x: -w / 2, y: d / 2 },
];

function source(over: Partial<SoundSource> = {}): SoundSource {
  return { id: "s#0", label: "S", deviceId: "s", pos: { x: 0, y: 2.7, z: 0 }, ...ceilingAxes(0), coverage: { horizontal: 90, vertical: 90 }, sensitivityDb: 88, watts: 1, estimates: [], ...over };
}

test("campo directo: 88 dB/1 W/1 m a 1 W y 2 m en eje da ≈ 82 dB", () => {
  const s = source({ pos: { x: 0, y: 3, z: 0 } });
  const spl = directSpl(s, { x: 0, y: 1, z: 0 });
  assert.ok(Math.abs(spl - 81.98) < 0.05, `SPL ${spl}`);
  // Duplicar la potencia suma 3 dB; duplicar la distancia resta 6 dB.
  assert.ok(Math.abs(directSpl({ ...s, watts: 2 }, { x: 0, y: 1, z: 0 }) - spl - 3.01) < 0.01);
  assert.ok(Math.abs(spl - directSpl(s, { x: 0, y: -1, z: 0 }) - 6.02) < 0.05);
});

test("directividad: −6 dB en el borde de la cobertura, 0 en eje y tope atrás", () => {
  const s = source();
  const edge = { x: Math.sin(Math.PI / 4), y: -Math.cos(Math.PI / 4), z: 0 };
  assert.ok(Math.abs(offAxisDb(s, edge) - 6) < 1e-6);
  assert.equal(offAxisDb(s, { x: 0, y: -1, z: 0 }), 0);
  assert.equal(offAxisDb(s, { x: 0, y: 1, z: 0 }), 25);
  // Cobertura elíptica: 90° horizontal × 60° vertical en pared; el borde vertical está a 30°.
  const w = { ...source(), ...wallAxes(0, 0), coverage: { horizontal: 90, vertical: 60 } };
  const up30 = { x: 0, y: Math.sin(Math.PI / 6), z: Math.cos(Math.PI / 6) };
  assert.ok(Math.abs(offAxisDb(w, up30) - 6) < 1e-6);
  // Q de Molloy: 180° × 180° = 2 (semiespacio); 90° × 90° = 6.
  assert.ok(Math.abs(directivityQ({ horizontal: 180, vertical: 180 }) - 2) < 1e-9);
  assert.ok(Math.abs(directivityQ({ horizontal: 90, vertical: 90 }) - 6) < 1e-9);
});

test("RT60: Sabine de una sala conocida y Eyring menor que Sabine", () => {
  // 10 × 8 × 3 m, todo hormigón (α 500 Hz = 0,02), sin personas.
  const geo = roomGeometry({ floor: rect(10, 8), heightM: 3, glassRatio: 0 });
  assert.equal(geo.volumeM3, 240);
  assert.equal(geo.totalAreaM2, 268);
  const bands = reverbBands(geo, { floor: "hormigon", ceiling: "hormigon", walls: "hormigon", glass: "vidrio" }, 0);
  const b500 = bands.find((b) => b.hz === 500)!;
  const air = 4 * (0.0019 / 4.343) * 240;
  const expected = (0.161 * 240) / (268 * 0.02 + air);
  assert.ok(Math.abs(b500.sabine - expected) < 1e-9, `${b500.sabine} vs ${expected}`);
  assert.ok(b500.eyring < b500.sabine);
  // Sala tratada (alfombra + cielorraso acústico) queda muy por debajo.
  const treated = reverbBands(geo, { floor: "alfombra", ceiling: "cielorraso-acustico", walls: "durlock", glass: "vidrio" }, 10);
  assert.ok(rtMid(treated) < 0.8 && rtMid(treated) < rtMid(bands) / 4, `RT tratado ${rtMid(treated)}`);
});

test("STI: 1 sin reverberación ni ruido, cae con RT60 alto y con ruido", () => {
  const band = (rt60: number, noiseDb: number, directRatio = 0) => Array.from({ length: 7 }, () => ({ speechDb: 70, directRatio, rt60, noiseDb }));
  const clean = stiFromBands(band(0, -50));
  assert.ok(clean > 0.95, `STI limpio ${clean}`);
  const rt05 = stiFromBands(band(0.5, -50));
  const rt1 = stiFromBands(band(1, -50));
  const rt2 = stiFromBands(band(2, -50));
  assert.ok(rt05 > rt1 && rt1 > rt2, `${rt05} ${rt1} ${rt2}`);
  // Referencia de Houtgast-Steeneken: campo difuso con T = 1 s y sin ruido ≈ 0,6.
  assert.ok(rt1 > 0.5 && rt1 < 0.7, `STI T=1 s ${rt1}`);
  assert.ok(stiFromBands(band(0.5, 65)) < rt05 - 0.15);
  // El sonido directo conserva la modulación.
  assert.ok(stiFromBands(band(2, -50, 0.5)) > rt2);
  assert.equal(transmissionIndex(0.5), 0.5);
});

test("ruido de fondo: NC-35 ≈ 43 dBA", () => {
  const dba = aWeighted(ncSpectrum(35));
  assert.ok(dba > 40 && dba < 46, `NC-35 = ${dba} dBA`);
});

test("mapa: uniformidad, estadísticas y STI con parlantes de techo", () => {
  const settings = resolveAcoustics("office", null, 48);
  const sources = [-2, 2].flatMap((x) => [-1.5, 1.5].map((z, i) => source({ id: `s#${x}${i}`, pos: { x, y: 2.65, z }, watts: 2 })));
  const map = computeSoundMap({ floor: rect(8, 6), heightM: 2.7, sources, settings });
  assert.ok(map.stats);
  const st = map.stats!;
  assert.ok(st.splMin <= st.splAvg && st.splAvg <= st.splMax);
  assert.ok(Math.abs(st.uniformityDb - (st.splMax - st.splMin) / 2) < 1e-9);
  assert.ok(st.stiAvg > 0.4 && st.stiAvg <= 1, `STI ${st.stiAvg}`);
  assert.equal(map.grid.spl.length, map.grid.cols * map.grid.rows);
  assert.ok(map.checks.some((c) => c.key === "uniformity"));
  assert.ok(map.estimates.some((e) => e.includes("materiales típicos")));
  // Sin parlantes no hay estadísticas pero sí RT60.
  const empty = computeSoundMap({ floor: rect(8, 6), heightM: 2.7, sources: [], settings });
  assert.equal(empty.stats, null);
  assert.ok(empty.rtMid > 0);
});

test("grilla sugerida: cubre el área sin huecos (mínimo solape) y más densa = más uniforme", () => {
  const floor = rect(8, 6);
  const settings = resolveAcoustics("office", { use: "voz" }, 48);
  const speaker = { label: "Techo", sensitivityDb: 88, coverageDeg: 90, taps: [0.5, 1, 2, 4, 8], volts: "70V" as const, continuousW: 30, estimates: [] };
  const g = designGrid({ floor, heightM: 2.7, speaker, settings, criterion: "min-overlap" });
  const r = coverageRadius(2.7, settings.earM, 90);
  assert.ok(Math.abs(r - 1.45) < 1e-9);
  assert.equal(g.count, 12);
  // Todo punto del área queda dentro del radio de algún parlante.
  for (let x = -4; x <= 4; x += 0.25) for (let z = -3; z <= 3; z += 0.25) assert.ok(g.positions.some((p) => Math.hypot(p.x - x, p.y - z) <= r + 1e-6), `hueco en ${x},${z}`);
  assert.ok(g.tapW != null && [0.5, 1, 2, 4, 8].includes(g.tapW));
  assert.ok(g.reaches, g.notes.join(" "));
  const [e2e, , e2c] = designGrids({ floor, heightM: 2.7, speaker, settings });
  assert.ok(e2e!.count < g.count && g.count < e2c!.count);
  assert.ok(e2c!.stats!.uniformityDb < e2e!.stats!.uniformityDb);
  // Baja impedancia: informa la potencia necesaria.
  const low = designGrid({ floor, heightM: 2.7, speaker: { ...speaker, taps: [], volts: null }, settings, criterion: "min-overlap" });
  assert.equal(low.tapW, null);
  assert.ok(low.requiredW != null && low.requiredW > 0);
});

test("potencia por parlante: tap del canal de 70 V, baja impedancia y sin datos", () => {
  const ports = { inputs: [], outputs: [], network: 0, lineVoltage: "70v", transformerTaps: { "70V": [2, 4, 8] }, speakerPowerWatts: { continuous: 30 } };
  const amp = [{ ampId: "amp#0", ampLabel: "A", channel: 1, partner: null, mode: "high" as const, volts: "70V" as const, speakerIds: ["d#0", "d#1"], loadOhms: null, minLoadOhms: null, taps: [4, 8], tapW: 12, capacityW: 120, usePct: 10 }];
  assert.equal(speakerWatts("d#1", ports, "P", amp, null, { category: "office", tapW: 8 }).watts, 8);
  const lowPorts = { inputs: [], outputs: [], network: 0, impedanceOhms: 8, speakerPowerWatts: { continuous: 40 } };
  const profile = { devices: { amp: { cls: "amp" as const, ports: { inputs: [], outputs: [], network: 0, ampWattsPerChannel: { "4Ω": 100, "8Ω": 60 } }, productId: null, label: "A", datasheet: "ok" as const, sourceKind: null, sources: [] } }, central: null };
  const low = [{ ...amp[0]!, ampId: "amp#0", mode: "low" as const, volts: null, speakerIds: ["d#0", "d#1"], loadOhms: 4, taps: [], tapW: 0 }];
  // Canal a 4 Ω con 100 W y dos parlantes de 8 Ω: 50 W cada uno, tope en la continua (40 W).
  assert.equal(speakerWatts("d#0", lowPorts, "P", low, profile, { category: "office", tapW: null }).watts, 40);
  const none = speakerWatts("x#0", null, "P", null, null, { category: "office", tapW: null });
  assert.equal(none.watts, 5, "potencia de diseño típica de oficina (5 W)");
  assert.ok(none.estimates[0]!.includes("sin potencia en la ficha"));
});

test("aplicar grilla: reubica las unidades en el techo, cambia la cantidad y fija el tap", async () => {
  const { applyGridToScene } = await import("./grid-apply");
  const { soundMapSvg, soundMapScale } = await import("./sound-map-svg");
  const scene = {
    version: 1 as const, templateKey: "t", widthM: 8, depthM: 6, heightM: 2.7, areaM2: 48, cameraPreset: "general" as const, coverageView: "zones" as const, selectedSlotKey: null,
    slots: [{ key: "spk", role: "speaker" as const, label: "Parlante", required: true, mount: "ceiling" as const, pose: { x: 0, y: 2.65, z: 0, rotY: 0 }, defaultQty: 2 }],
    devices: [{ id: "d1", slotKey: "spk", productId: "p", designRole: "speaker", label: "Parlante", quantity: 2, pose: { x: 0, y: 2.65, z: 0, rotY: 0 }, coverage: null }],
  };
  const settings = resolveAcoustics("office", null, 48);
  const speaker = { label: "Techo", sensitivityDb: 88, coverageDeg: 90, taps: [1, 2, 4], volts: "70V" as const, continuousW: 20, estimates: [] };
  const g = designGrid({ floor: rect(8, 6), heightM: 2.7, speaker, settings, criterion: "min-overlap" });
  const next = applyGridToScene(scene, "d1", g);
  const d = next.devices[0]!;
  assert.equal(d.quantity, g.count);
  assert.equal(d.units!.length, g.count);
  assert.ok(d.units!.every((u) => u.placed && u.pose.y === 2.65));
  assert.equal(next.acoustics?.tapW, g.tapW);
  assert.equal(scene.devices[0]!.quantity, 2, "no muta la escena original");
  // Lámina: SVG en mm con las celdas y la escala.
  const map = computeSoundMap({ floor: rect(8, 6), heightM: 2.7, sources: [source()], settings });
  const sc = soundMapScale(rect(8, 6), { w: 272, h: 132 });
  const svg = soundMapSvg(map, "sti", rect(8, 6), { w: 272, h: 132 }, sc.denominator);
  assert.ok(svg.startsWith("<svg") && svg.includes('width="272mm"') && svg.includes("<rect"));
});
