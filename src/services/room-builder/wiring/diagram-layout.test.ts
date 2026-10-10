import assert from "node:assert/strict";
import { test } from "node:test";
import { layoutDiagram, blockKey } from "./diagram-layout";
import { expandIoPorts } from "./ports";
import type { IoPort } from "../io-profile/types";

const io = (signal: IoPort["signal"], direction: IoPort["direction"], count: number, label: string): IoPort => ({ signal, direction, count, connector: null, channels: null, poe: null, label, evidence: label });
const dev = (deviceId: string, role: string) => ({ deviceId, unit: 0, label: deviceId, short: deviceId, x: 0, y: 0, z: 0, rotY: 0, mount: "wall", remote: false, role });
const wire = (id: string, a: string, ap: string, b: string, bp: string) => ({ id, from: { deviceId: a, unit: 0, portId: ap }, to: { deviceId: b, unit: 0, portId: bp }, signal: "hdmi" as const, cableProductId: null, label: id, points: [], lengthOverrideM: null, origin: "manual" as const, lengthM: 1 });

function model() {
  return {
    devices: [dev("tv", "display"), dev("sw", "other"), dev("pc", "other")],
    ports: {
      pc: expandIoPorts([io("hdmi", "out", 1, "HDMI OUT")]),
      sw: expandIoPorts([io("hdmi", "in", 2, "HDMI IN 1-2"), io("hdmi", "out", 1, "HDMI OUT")]),
      tv: expandIoPorts([io("hdmi", "in", 3, "HDMI 1-3")]),
    },
    wires: [wire("w1", "pc", "out:hdmi:1", "sw", "in:hdmi:1"), wire("w2", "sw", "out:hdmi:1", "tv", "in:hdmi:1")],
    issues: [],
  };
}

test("diagrama: columnas por flujo de señal (fuente → proceso → salida)", () => {
  const d = layoutDiagram(model() as never);
  const col = (k: string) => d.blocks.find((b) => b.key === blockKey(k, 0))!.column;
  assert.equal(col("pc"), 0);
  assert.equal(col("sw"), 1);
  assert.equal(col("tv"), 2);
  const x = (k: string) => d.blocks.find((b) => b.key === blockKey(k, 0))!.x;
  assert.ok(x("pc") < x("sw") && x("sw") < x("tv"));
});

test("diagrama: entradas a la izquierda, salidas a la derecha; cada cable une sus dos puertos", () => {
  const d = layoutDiagram(model() as never);
  const sw = d.blocks.find((b) => b.key === "sw#0")!;
  assert.ok(sw.ports.filter((p) => p.direction === "in").every((p) => p.side === "left"));
  assert.ok(sw.ports.filter((p) => p.direction === "out").every((p) => p.side === "right"));
  const w1 = d.wires.find((w) => w.id === "w1")!;
  const pc = d.blocks.find((b) => b.key === "pc#0")!;
  assert.deepEqual(w1.points[0], [pc.x + pc.w, pc.y + pc.ports[0]!.y]);
  const last = w1.points[w1.points.length - 1]!;
  assert.equal(last[0], sw.x);
  // Tramos rectos: cada segmento es horizontal o vertical.
  for (let i = 1; i < w1.points.length; i++) {
    const [a, b] = [w1.points[i - 1]!, w1.points[i]!];
    assert.ok(a[0] === b[0] || a[1] === b[1]);
  }
});

test("diagrama: respeta la posición movida a mano y los equipos sin cables van por su rol", () => {
  const m = model();
  m.devices.push(dev("cam", "camera"));
  const d = layoutDiagram(m as never, { "tv#0": { x: 900, y: 500 } });
  const tv = d.blocks.find((b) => b.key === "tv#0")!;
  assert.equal(tv.x, 900);
  assert.equal(tv.y, 500);
  assert.equal(d.blocks.find((b) => b.key === "cam#0")!.column, 0);
  assert.equal(d.blocks.find((b) => b.key === "cam#0")!.noPorts, true);
});
