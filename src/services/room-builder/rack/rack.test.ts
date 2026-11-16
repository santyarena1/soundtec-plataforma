import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRack, dropInOrder, mergeOrder, moveInOrder, rackFit, suggestRackSize, unitsFromCm, type RackItemInput } from "./rack-elevation";
import { devicePower, heatFromSpecs, pduFor, poeClassWatts, powerFromSpecs, ventilationFor } from "./rack-power";

const item = (key: string, over: Partial<RackItemInput> = {}): RackItemInput => ({
  key,
  deviceId: key.split("#")[0]!,
  unit: Number(key.split("#")[1] ?? 0),
  name: key,
  brand: null,
  cls: "other",
  rackUnits: 1,
  sizeCm: { w: 44, h: 4.4, d: 30 },
  weightKg: 3,
  specs: [{ label: "Power Consumption", value: "20 W typical" }],
  ampTotalW: null,
  poe: null,
  poeBudgetW: null,
  ...over,
});

test("consumo de la ficha: típico, 1/8 en amplificadores, sin PoE en switches y calor", () => {
  assert.equal(powerFromSpecs([{ label: "Power Consumption", value: "93 W typical; 72 W idle" }])?.watts, 93);
  const amp = powerFromSpecs([{ label: "Power Consumption", value: "115 W, (2 channels driven at 1/8th output power, 4 Ω); 8.8 W, idle; 0.31 W, power saver" }], { amp: true });
  assert.deepEqual([amp?.watts, amp?.basis], [115, "1/8"]);
  const sw = powerFromSpecs([{ label: "Power Consumption", value: "Max PoE: 837.7 W No PoE: 26.3 W Standby: 18 W" }]);
  assert.deepEqual([sw?.watts, sw?.basis], [26.3, "no-poe"]);
  assert.equal(powerFromSpecs([{ label: "Consumption", value: "< 1.0 W" }])?.watts, 1);
  assert.equal(powerFromSpecs([{ label: "Power Consumption (Idle)", value: "14 Watts" }]), null);
  // Sin consumo: del calor (BTU/h ÷ 3,412); las fórmulas por carga no cuentan.
  const heat = powerFromSpecs([{ label: "Heat Dissipation", value: "26 BTU/hr + (4.7 BTU/hr x Load Current in Amps); 176 BTU/hr at maximum load" }]);
  assert.deepEqual([heat?.watts, heat?.fromHeat, heat?.basis], [51.6, true, "max"]);
  assert.equal(heatFromSpecs([{ label: "Heat Dissipation", value: "375 BTU/hr, all channels driven at 1/8th output power; 250 BTU/hr, all channels idle" }], { amp: true }), 375);
  assert.equal(powerFromSpecs([{ label: "Power", value: "(1) green LED" }]), null);
});

test("consumo estimado sin ficha queda marcado; amplificador por su salida a 1/8", () => {
  const amp = devicePower({ cls: "amp", specs: [], ampTotalW: 1200 });
  assert.equal(amp.kind, "estimado");
  assert.equal(amp.watts, 265); // 1200 / 8 / 0,6 + 15
  assert.equal(amp.heatBtu, Math.round(265 * 3.412));
  const ctl = devicePower({ cls: "control", specs: [], ampTotalW: null });
  assert.deepEqual([ctl.kind, ctl.watts], ["estimado", 15]);
  const ficha = devicePower({ cls: "dsp", specs: [{ label: "Power Consumption", value: "30 Watts typical" }, { label: "Heat Dissipation", value: "102 BTU/hr" }], ampTotalW: null });
  assert.deepEqual([ficha.kind, ficha.watts, ficha.heatBtu], ["ficha", 30, 102]);
});

test("alto en U: ficha, deducido de la altura (estimado), media unidad y bandeja", () => {
  assert.deepEqual(rackFit({ rackUnits: 2, sizeCm: { w: 44, h: 8.9, d: 40 } }), { mode: "rack", u: 2, estimated: false, note: null });
  const est = rackFit({ rackUnits: null, sizeCm: { w: 44.2, h: 8.9, d: 21 } });
  assert.deepEqual([est.mode, est.u, est.estimated], ["rack", 2, true]);
  assert.equal(unitsFromCm(4.4), 1);
  assert.equal(unitsFromCm(4.6), 1);
  assert.equal(unitsFromCm(8.89), 2);
  assert.equal(rackFit({ rackUnits: 1, sizeCm: { w: 21, h: 4.3, d: 20 } }).mode, "half");
  const desk = rackFit({ rackUnits: null, sizeCm: { w: 12.8, h: 3.5, d: 13 } });
  assert.deepEqual([desk.mode, desk.u, desk.estimated], ["shelf", 2, false]);
  const unknown = rackFit({ rackUnits: null, sizeCm: null });
  assert.deepEqual([unknown.mode, unknown.u, unknown.estimated], ["shelf", 2, true]);
});

test("rack sugerido comercial con al menos 20 % libre", () => {
  assert.equal(suggestRackSize(4), 6);
  assert.equal(suggestRackSize(5), 9);
  assert.equal(suggestRackSize(9), 12);
  assert.equal(suggestRackSize(10), 16);
  assert.equal(suggestRackSize(33), 42);
  assert.equal(suggestRackSize(34), null);
});

test("orden lógico: red arriba, control, fuentes, amplificadores abajo con 1U ventilado y PDU al fondo", () => {
  const rack = buildRack({
    id: "r",
    title: "Rack",
    scope: "room",
    order: null,
    poeLoads: [],
    items: [
      item("amp#0", { cls: "amp", rackUnits: 2, specs: [{ label: "Power Consumption", value: "240 W (All channels driven at 1/8th power, 8 ohms)" }, { label: "Heat Dissipation", value: "450 BTU/hr" }] }),
      item("stream#0", { cls: "streamer" }),
      item("sw#0", { cls: "switch", name: "Switch PoE 12" }),
      item("ctl#0", { cls: "control" }),
      item("cam#0", { cls: "camera" }),
    ],
  });
  const seq = rack.blocks.map((b) => b.key);
  assert.deepEqual(seq, ["sw#0", "ctl#0", "stream#0", "blank", "vent:amp#0", "amp#0", "pdu"]);
  // 1 + 1 + 1 + 1 (vent) + 2 + 1 (PDU) = 7U → 9U (2U libres = 22 %).
  assert.equal(rack.usedU, 7);
  assert.equal(rack.sizeU, 9);
  assert.equal(rack.freeU, 2);
  assert.equal(rack.blocks[0]!.top, 9);
  assert.equal(rack.blocks[rack.blocks.length - 1]!.bottom, 1);
  assert.deepEqual(rack.order, ["sw#0", "ctl#0", "stream#0", "amp#0"]);
  // La cámara no va al rack.
  assert.ok(!rack.blocks.some((b) => b.items.some((i) => i.key === "cam#0")));
  // Energía: 20 × 3 + 240 = 300 W; calor del amplificador de la ficha (450 BTU/h).
  assert.equal(rack.power.totalW, 300);
  assert.equal(rack.power.amps, 1.4);
  assert.equal(rack.power.outlets, 4);
  assert.equal(rack.power.heatBtu, 3 * Math.round(20 * 3.412) + 450);
  assert.equal(rack.power.pdu.outlets, 6);
  assert.equal(rack.power.pdu.amps, 10);
  assert.equal(rack.power.ventilation.level, "pasiva");
});

test("PoE: los equipos alimentados por el switch suman en el switch, no tienen toma, y el calor que sale a la sala no queda en el rack", () => {
  const rack = buildRack({
    id: "r",
    title: "Rack",
    scope: "room",
    order: null,
    poeLoads: [{ name: "Cámara", watts: 12.95, estimated: false }],
    items: [
      item("sw#0", { cls: "switch", name: "CEN-SWPOE-ULTRA-12", specs: [{ label: "Power Consumption", value: "Max PoE: 837.7 W No PoE: 26.3 W Standby: 18 W" }], poeBudgetW: 10 }),
      item("ctl#0", { cls: "control", poe: { pd: true, watts: 7, estimated: false }, specs: [{ label: "Power Consumption", value: "7 W typical" }] }),
    ],
  });
  const sw = rack.power.rows.find((r) => r.key === "sw#0")!;
  assert.equal(sw.watts, 46.3); // 26,3 + 7 + 12,95 redondeado
  assert.equal(rack.power.rows.find((r) => r.key === "ctl#0")!.kind, "poe");
  assert.equal(rack.power.outlets, 1);
  assert.equal(rack.power.poeOutsideW, 13);
  assert.ok(rack.warnings.some((w) => w.includes("supera el presupuesto PoE")));
});

test("estimados marcados: U deducida, consumo sin ficha y equipos sin PoE de switch", () => {
  const rack = buildRack({
    id: "r",
    title: "Rack",
    scope: "central",
    order: null,
    poeLoads: [{ name: "Panel", watts: 6, estimated: true }],
    items: [item("amp#0", { cls: "amp", rackUnits: null, sizeCm: { w: 48, h: 8.9, d: 40 }, specs: [], ampTotalW: 800 }), item("gw#0", { cls: "control", rackUnits: null, sizeCm: { w: 12.8, h: 3.5, d: 13 } })],
  });
  const amp = rack.blocks.find((b) => b.key === "amp#0")!;
  assert.equal(amp.estimated, true);
  assert.equal(amp.u, 2);
  assert.ok(rack.blocks.some((b) => b.kind === "shelf"));
  assert.ok(rack.power.estimatedW > 0);
  assert.ok(rack.warnings.some((w) => w.includes("estimados")));
  assert.ok(rack.warnings.some((w) => w.includes("sin switch PoE")));
  assert.ok(rack.warnings.some((w) => w.includes("Alto en U estimado")));
});

test("orden guardado a mano: manda, y los equipos nuevos entran en su lugar lógico", () => {
  assert.deepEqual(mergeOrder(["a", "b", "c", "d"], ["c", "a"]), ["b", "c", "a", "d"]);
  assert.deepEqual(mergeOrder(["a", "b", "c"], ["c", "b", "a", "zz"]), ["c", "b", "a"]);
  assert.deepEqual(mergeOrder(["a", "b", "c"], null), ["a", "b", "c"]);
  assert.deepEqual(mergeOrder(["sw", "ctl", "amp"], ["ctl", "sw"]), ["ctl", "sw", "amp"]);
  assert.deepEqual(moveInOrder(["a", "b", "c"], "c", -1), ["a", "c", "b"]);
  assert.deepEqual(moveInOrder(["a", "b", "c"], "a", -1), ["a", "b", "c"]);
  assert.deepEqual(dropInOrder(["a", "b", "c"], "c", "a"), ["c", "a", "b"]);
  const rack = buildRack({ id: "r", title: "Rack", scope: "room", poeLoads: [], order: ["amp#0", "sw#0"], items: [item("sw#0", { cls: "switch" }), item("amp#0", { cls: "amp" })] });
  assert.deepEqual(rack.blocks.map((b) => b.key).slice(0, 4), ["blank", "vent:amp#0", "amp#0", "sw#0"]);
});

test("PDU, ventilación y racks que no entran", () => {
  assert.deepEqual(pduFor(10, 5), { outlets: 16, amps: 10, circuits: 1, vertical: true });
  assert.equal(pduFor(4, 14).amps, 20);
  assert.equal(pduFor(4, 40).circuits, 3);
  assert.equal(ventilationFor(200).level, "pasiva");
  assert.equal(ventilationFor(800).level, "forzada");
  assert.equal(ventilationFor(800).cfm, 170);
  assert.equal(ventilationFor(2000).level, "climatizada");
  assert.equal(poeClassWatts("IEEE 802.3at Type 1 (802.3af compatible) Class 0").watts, 12.95);
  assert.equal(poeClassWatts("PoE+ class 4").watts, 25.5);
  const big = buildRack({ id: "r", title: "Rack", scope: "central", poeLoads: [], order: null, items: Array.from({ length: 20 }, (_, i) => item(`amp${i}#0`, { cls: "amp", rackUnits: 2 })) });
  assert.ok(big.warnings.some((w) => w.includes("no entran en un rack de 42U")));
  assert.equal(buildRack({ id: "e", title: "Vacío", scope: "room", poeLoads: [], order: null, items: [] }).empty, true);
});
