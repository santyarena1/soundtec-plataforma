import { test } from "node:test";
import assert from "node:assert/strict";
import type { RoomBrief } from "./brief";
import { layoutSlotsForScene } from "./slot-layout";
import { inDoorSwing, rackAnchor, defaultDoors } from "./rack-place";
import { vcTable } from "./vc-table";
import { genericForSlot } from "./generic/library";

function brief(over: Partial<RoomBrief> = {}): RoomBrief {
  return {
    version: 1,
    systems: ["audio"],
    control: "none",
    vcPlatform: null,
    audio: { speakerStyle: "ceiling", use: "voice", zones: 1, speakers: null, streaming: false },
    video: { displays: 1, sizeIn: null },
    brands: {},
    tier: "recomendado",
    notes: null,
    ...over,
  };
}

const MEETING = { widthM: 6, depthM: 4, heightM: 2.7 };
const CLASSROOM = { widthM: 10, depthM: 8, heightM: 2.9 };
const LIVING = { widthM: 7, depthM: 5, heightM: 2.7 };
const keys = (slots: Array<{ key: string }>) => slots.map((s) => s.key);
const byKey = <T extends { key: string }>(slots: T[], key: string) => slots.find((s) => s.key === key);

test("videoconferencia Teams: PC de sala, DSP con cancelación de eco, parlantes y amplificador", () => {
  const slots = layoutSlotsForScene("vc-meeting-m", MEETING, brief({ systems: ["vc", "video", "control", "audio"], control: "crestron-pro", vcPlatform: "teams", people: 8 }));
  const codec = byKey(slots, "codec");
  assert.ok(codec && /Teams/.test(codec.label));
  assert.match(byKey(slots, "dsp")?.label ?? "", /cancelación de eco/);
  assert.ok(slots.some((s) => s.role === "speaker" && s.required));
  assert.ok(byKey(slots, "amplifier"));
  assert.ok(byKey(slots, "camera_main"));
  // Nada que no se pidió.
  assert.ok(!byKey(slots, "presentation") && !byKey(slots, "mic_wireless"));
});

test("videoconferencia sin audio marcado: igual lleva parlantes para la llamada", () => {
  const slots = layoutSlotsForScene("vc-meeting-m", MEETING, brief({ systems: ["vc", "video"], vcPlatform: "zoom", audio: null }));
  assert.ok(slots.some((s) => s.role === "speaker" && s.required && s.defaultQty >= 2));
  assert.match(byKey(slots, "codec")?.label ?? "", /Zoom/);
});

test("BYOD: sin códec; la notebook entra por la conexión de mesa", () => {
  const slots = layoutSlotsForScene("vc-meeting-m", MEETING, brief({ systems: ["vc", "video"], vcPlatform: "byod" }));
  assert.ok(!slots.some((s) => s.role === "codec"));
  assert.ok(byKey(slots, "table_input"));
});

test("las respuestas cambian la selección: personas, micrófono y presentación inalámbrica", () => {
  const base = brief({ systems: ["vc", "video"], vcPlatform: "teams" });
  const many = layoutSlotsForScene("vc-boardroom-l", { widthM: 8, depthM: 5, heightM: 2.8 }, { ...base, people: 24 });
  assert.equal(many.find((s) => s.role === "mic" && s.mount === "ceiling")?.defaultQty, 3);
  const extras = layoutSlotsForScene("vc-meeting-m", MEETING, { ...base, wirelessMic: true, wirelessPresentation: true });
  assert.ok(byKey(extras, "mic_wireless") && byKey(extras, "presentation"));
});

test("aula sin videoconferencia: micrófono inalámbrico del docente, DSP de voz, conexión de mesa; sin micrófonos de techo", () => {
  const slots = layoutSlotsForScene("classroom-m", CLASSROOM, brief({ systems: ["video", "audio"], people: 30 }));
  assert.ok(!slots.some((s) => s.role === "mic" && s.mount === "ceiling"));
  assert.match(byKey(slots, "mic_wireless")?.label ?? "", /docente/);
  assert.match(byKey(slots, "dsp")?.label ?? "", /refuerzo de voz/);
  assert.ok(byKey(slots, "table_input"));
  assert.ok(byKey(slots, "amplifier"));
  assert.ok(!slots.some((s) => s.role === "camera"));
  // Si dicen que no hay micrófono inalámbrico, no va (y sin micrófonos no hace falta DSP).
  const none = layoutSlotsForScene("classroom-m", CLASSROOM, brief({ systems: ["video", "audio"], wirelessMic: false }));
  assert.ok(!byKey(none, "mic_wireless") && !byKey(none, "dsp"));
});

test("cine 5.1: receptor AV, L/C/R al frente, envolventes a los costados, subwoofer y fuente; sin amplificador aparte", () => {
  const slots = layoutSlotsForScene("residential-living-m", LIVING, brief({ systems: ["audio", "video", "control"], control: "crestron-home", audio: { speakerStyle: "wall", use: "cinema", zones: 1, speakers: null, streaming: false, layout: "5.1" } }));
  const front = byKey(slots, "speakers_front");
  assert.equal(front?.defaultQty, 3);
  assert.equal(front?.mount, "wall");
  assert.ok(front && front.pose.z > 0, "L/C/R en la pared de la pantalla");
  const l = byKey(slots, "speakers_surround_l")!;
  const r = byKey(slots, "speakers_surround_r")!;
  assert.ok(l.pose.x < 0 && r.pose.x > 0, "envolventes en paredes enfrentadas");
  assert.ok(byKey(slots, "subwoofer") && byKey(slots, "amp_avr") && byKey(slots, "source_video"));
  assert.ok(!byKey(slots, "amplifier") && !byKey(slots, "speakers_rear"));
  assert.equal(slots.filter((s) => s.role === "speaker").reduce((n, s) => n + s.defaultQty, 0), 6);
  // Con control, además va el procesador Crestron Home (no confundido con el receptor).
  assert.match(byKey(slots, "processor")?.label ?? "", /Home/);
});

test("cine 7.1 suma los traseros", () => {
  const slots = layoutSlotsForScene("residential-cinema-m", { widthM: 6, depthM: 5.5, heightM: 2.7 }, brief({ systems: ["audio", "video"], audio: { speakerStyle: "wall", use: "cinema", zones: 1, speakers: null, streaming: false, layout: "7.1" } }));
  assert.equal(byKey(slots, "speakers_rear")?.defaultQty, 2);
  assert.ok(!keys(slots).includes("speakers_surround"));
});

test("rack: dentro de la sala, contra el fondo y fuera del barrido de la puerta", () => {
  for (const dims of [MEETING, CLASSROOM, LIVING, { widthM: 3.7, depthM: 2.7 }]) {
    const rack = rackAnchor(dims);
    assert.ok(Math.abs(rack.x) < dims.widthM / 2 && Math.abs(rack.z) < dims.depthM / 2);
    assert.ok(!inDoorSwing(rack, defaultDoors(dims)), `rack en la puerta (${dims.widthM}×${dims.depthM})`);
  }
  // Puerta del plano en el rincón del fondo derecho: el rack se va al izquierdo.
  const rack = rackAnchor(MEETING, [{ x: 2.4, z: -2 }]);
  assert.ok(rack.x < 0 && rack.z < 0);
  // Todo lo de rack de la sala va al mismo mueble.
  const slots = layoutSlotsForScene("vc-meeting-m", MEETING, brief({ systems: ["vc", "video", "control", "audio"], control: "crestron-pro", vcPlatform: "teams" }));
  const racks = slots.filter((s) => s.mount === "rack");
  assert.ok(racks.length >= 4 && racks.every((s) => s.pose.x === racks[0]!.pose.x && s.pose.z === racks[0]!.pose.z));
});

test("mesa de reunión perpendicular a la pantalla, con la cabecera hacia ella", () => {
  const t = vcTable(MEETING, "M");
  assert.ok(t.perpendicular && t.d > t.w);
  assert.ok(t.headZ < MEETING.depthM / 2 && t.headZ > t.z);
});

test("genéricos de la cadena: cada lugar con el equipo que corresponde", () => {
  assert.equal(genericForSlot("PC / códec de sala (Microsoft Teams Rooms)", "codec"), "room-pc");
  assert.equal(genericForSlot("Procesador de audio con cancelación de eco (DSP)", "processor"), "dsp");
  assert.equal(genericForSlot("Micrófono inalámbrico del docente", "mic"), "wireless-mic");
  assert.equal(genericForSlot("Receptor / procesador AV", "processor"), "av-receiver");
  assert.equal(genericForSlot("Conexión de mesa para notebook (HDMI + USB-C)", "other"), "table-box");
  assert.equal(genericForSlot("Envolvente izquierdo", "speaker", "wall"), "wall-speaker");
});
