"use client";

// Banco local (no se commitea): diagrama de conexiones de una sala de reunión de ejemplo.

import { planCabling, type CableNode } from "@/services/room-builder/cabling";
import { deviceClass, devicePorts } from "@/services/room-builder/device-ports";
import type { IoCapabilities, IoPort, IoProfileData, IoSignal } from "@/services/room-builder/io-profile/types";
import { DiagramSvg } from "@/components/room-builder/cabling/connection-diagram";

function io(ports: Array<[IoSignal, IoPort["direction"], number, Partial<IoPort>?]>, caps: Record<string, unknown> = {}): IoProfileData {
  return {
    ports: ports.map(([signal, direction, count, extra]) => ({ signal, direction, count, connector: null, channels: null, poe: null, label: `${signal}`, evidence: "x", ...extra })),
    capabilities: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "x" }])) as IoCapabilities,
  };
}
function node(id: string, role: string, name: string, pos: [number, number, number], mount: string, profile: IoProfileData, amp = false): CableNode {
  const spec = amp ? { kind: "amplifier" as const, channels: null, wattsPerChannel: null, minOhms: null, nominalOhms: null, highImpedance: false, streaming: false, networked: false, source: "auto" as const } : null;
  return { id, label: name, cls: deviceClass({ role, slotKey: role, name, spec }), ports: devicePorts(profile), pos: { x: pos[0], y: pos[1], z: pos[2] }, mount, productId: id };
}

const plan = planCabling({
  nodes: [
    node("codec", "codec", "Crestron UC-C160-T", [-2.8, 0.45, 1.8], "rack", io([["hdmi", "out", 2], ["hdmi", "in", 1], ["usb-a", "bidir", 3], ["lan", "bidir", 1]])),
    node("d1", "display", "Pantalla 65 pulgadas", [-0.9, 1.4, -1.95], "wall", io([["hdmi", "in", 3], ["rs232", "in", 1], ["lan", "bidir", 1]])),
    node("d2", "display", "Pantalla 65 pulgadas (2)", [0.9, 1.4, -1.95], "wall", io([["hdmi", "in", 3], ["rs232", "in", 1], ["lan", "bidir", 1]])),
    node("cam", "camera", "Crestron IV-CAM-I20-W", [0, 1.1, -1.95], "wall", io([["usb-c", "bidir", 1]])),
    node("m1", "mic", "Micrófono de techo Dante", [0, 2.75, 0], "ceiling", io([["dante", "bidir", 1, { poe: "pd" }]], { danteTx: 8, poeWatts: 12.95 })),
    ...[0, 1, 2, 3].map((k) => node(`s${k}`, "speaker", `Sonance VP62R (${k + 1})`, [-1.5 + k, 2.75, 1], "ceiling", io([["speaker", "in", 1]], { lineVoltage: "both" }))),
    node("amp", "other", "Blaze PowerZone Connect 504", [-2.8, 0.45, 1.6], "rack", io([["speaker", "out", 4], ["analog-audio", "in", 4], ["dante", "bidir", 1]], { danteRx: 4, lineVoltage: "low-z" }), true),
    node("dsp", "processor", "DSP de sala Dante", [-2.8, 0.45, 1.4], "rack", io([["analog-audio", "in", 4], ["analog-audio", "out", 4], ["usb-b", "bidir", 1], ["dante", "bidir", 1]], { danteRx: 8, danteTx: 8 })),
    node("ctl", "processor", "Crestron CP4N", [-2.8, 0.45, 1.2], "rack", io([["rs232", "bidir", 3], ["ir", "out", 8], ["lan", "bidir", 1]])),
    node("tp", "touch", "Crestron TSW-770", [0, 0.76, 0], "table", io([["lan", "bidir", 1, { poe: "pd" }]], { poeWatts: 6.5 })),
    node("kp", "touch", "Crestron HZ-KPCN", [2.9, 1.2, 0], "wall", io([], { wireless: [{ protocol: "infinet", role: "client", capacity: null }] })),
    node("gw", "other", "Crestron CEN-GWEXER", [-2.8, 2.6, 0], "ceiling", io([["lan", "bidir", 1]], { wireless: [{ protocol: "infinet", role: "gateway", capacity: 100 }] })),
  ],
  dims: { widthM: 6, depthM: 4, heightM: 2.8 },
  tableInput: { x: 0, z: 0.3, topY: 0.75 },
});

export default function DiagramHarness() {
  return (
    <div id="ready" style={{ background: "#fff" }}>
      <DiagramSvg plan={plan} />
    </div>
  );
}
