import { test } from "node:test";
import assert from "node:assert/strict";
import { planCabling, type CableNode } from "./cabling";
import { deviceClass, devicePorts } from "./device-ports";
import { genericByKey } from "./generic/library";
import type { IoCapabilities, IoPort, IoProfileData, IoSignal } from "./io-profile/types";

const dims = { widthM: 6, depthM: 4, heightM: 2.8 };

function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>, caps: Record<string, unknown> = {}): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal} ${direction}`, evidence: "cita", ...extra })),
    capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "cita" }])) as IoCapabilities,
  };
}
function node(id: string, role: string, name: string, pos: [number, number, number], mount: string, profile: IoProfileData | null, kind?: "amplifier"): CableNode {
  const spec = kind ? { kind, channels: null, wattsPerChannel: null, minOhms: null, nominalOhms: null, highImpedance: false, streaming: false, networked: false, source: "auto" as const } : null;
  return { id, label: name, cls: deviceClass({ role, slotKey: role, name, spec }), ports: devicePorts(profile), pos: { x: pos[0], y: pos[1], z: pos[2] }, mount, productId: `p-${id}` };
}
/** Nodo a partir de un genérico de la librería (sus puertos y su clase). */
function generic(id: string, key: string, pos: [number, number, number]): CableNode {
  const g = genericByKey(key)!;
  return { id, label: g.name, cls: g.cls, ports: devicePorts({ ports: g.ports, capabilities: g.capabilities }), pos: { x: pos[0], y: pos[1], z: pos[2] }, mount: g.mount, productId: null };
}
const has = (plan: ReturnType<typeof planCabling>, from: string, to: string, signal: string) => plan.links.some((l) => l.from === from && l.to === to && l.signal === signal);

// UC-CAM-L1 (Huddly L1) y su adaptador UC-CAMA-ADPT-ENET-USB, como figuran en la ficha.
const CAM_L1 = io([["lan", "bidir", 1, { poe: "pd" }], ["usb-c", "bidir", 1]]);
const ADAPTER = io([["lan", "bidir", 1, { poe: "pse" }], ["usb-c", "bidir", 1]]);

test("cámara con adaptador USB-PoE: cámara → adaptador por UTP y adaptador → PC de sala por USB (no al switch)", () => {
  const plan = planCabling({
    dims,
    nodes: [
      generic("pc", "room-pc", [2.5, 0.45, -1.5]),
      generic("tv", "tv", [0, 1.4, 1.9]),
      node("cam", "camera", "UC-CAM-L1", [0, 1.85, 1.9], "wall", CAM_L1),
      node("adp", "other", "UC-CAMA-ADPT-ENET-USB", [2.5, 0.45, -1.5], "rack", ADAPTER),
    ],
  });
  assert.ok(has(plan, "cam", "adp", "lan"));
  assert.ok(has(plan, "adp", "pc", "usb"));
  assert.ok(!plan.links.some((l) => l.from === "cam" && l.to.startsWith("switch")));
});

test("cine: fuente → receptor AV → pantalla; parlantes y subwoofer al receptor; sin streamer", () => {
  const plan = planCabling({
    dims,
    nodes: [
      generic("avr", "av-receiver", [2.5, 0.45, -1.5]),
      generic("src", "media-player", [2.5, 0.45, -1.5]),
      generic("tv", "tv", [0, 1.4, 1.9]),
      ...["l", "c", "r"].map((k, i) => generic(k, "wall-speaker", [-1 + i, 1.1, 1.9])),
      generic("sl", "wall-speaker", [-2.9, 1.7, -0.4]),
      generic("sr", "wall-speaker", [2.9, 1.7, -0.4]),
      generic("sub", "passive-sub", [2, 0, 1.6]),
    ],
  });
  assert.ok(has(plan, "src", "avr", "hdmi"));
  assert.ok(has(plan, "avr", "tv", "hdmi"));
  assert.ok(!has(plan, "src", "tv", "hdmi"));
  assert.equal(plan.links.filter((l) => l.from === "avr" && l.signal === "speaker").length, 6);
  assert.ok(!plan.findings.some((f) => f.fix?.generic === "audio-streamer"));
});

test("aula sin control: notebook por la caja de mesa al proyector, micrófono inalámbrico al DSP; sin switch", () => {
  const plan = planCabling({
    dims: { widthM: 10, depthM: 8, heightM: 2.9 },
    networkOptional: true,
    nodes: [
      generic("proj", "projector", [0, 2.8, 0]),
      generic("box", "table-box", [1.5, 0.76, 3]),
      generic("mic", "wireless-mic", [4.5, 0.45, -3.5]),
      generic("dsp", "dsp", [4.5, 0.45, -3.5]),
      generic("amp", "amp-4ch", [4.5, 0.45, -3.5]),
      ...[0, 1, 2, 3].map((k) => generic(`s${k}`, "ceiling-speaker", [-3 + 2 * k, 2.85, 1])),
    ],
  });
  assert.ok(has(plan, "box", "proj", "hdmi"));
  assert.ok(has(plan, "mic", "dsp", "line"));
  assert.ok(has(plan, "dsp", "amp", "line"));
  assert.ok(!plan.findings.some((f) => f.id === "net-switch-new"));
  assert.ok(!plan.findings.some((f) => f.fix?.generic === "media-player" || f.fix?.generic === "audio-streamer"));
});

test("presentación inalámbrica en sala con códec: entra por otra entrada HDMI de la pantalla", () => {
  const plan = planCabling({
    dims,
    nodes: [generic("pc", "room-pc", [2.5, 0.45, -1.5]), generic("tv", "tv", [0, 1.4, 1.9]), generic("am", "wireless-presentation", [2.5, 0.45, -1.5])],
  });
  assert.ok(has(plan, "pc", "tv", "hdmi") && has(plan, "am", "tv", "hdmi"));
});
