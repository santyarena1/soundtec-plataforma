import { test } from "node:test";
import assert from "node:assert/strict";
import { centralizedFor, checkProjectSystem, defaultProjectSystem, normalizeProjectSystem, projectTotals, unitsFor, type CentralDevice, type RoomLoad } from "./project-system";
import type { SystemSpec } from "./system-specs";

const spec = (over: Partial<SystemSpec>): SystemSpec => ({
  kind: "other",
  channels: null,
  wattsPerChannel: null,
  minOhms: null,
  nominalOhms: null,
  highImpedance: false,
  streaming: false,
  networked: false,
  source: "auto",
  ...over,
});

function room(id: string, speakers: number, over: Partial<RoomLoad> = {}): RoomLoad {
  return {
    id,
    name: id,
    unitCount: 1,
    speakers,
    zones: 1,
    speakerSpec: { nominalOhms: 8, highImpedance: false, wattsPerChannel: 60 },
    streaming: true,
    touchPoints: 1,
    networked: 0,
    centralized: { audio: true, control: true },
    ...over,
  };
}

test("recomendación: casa centraliza, oficinas van por sala salvo Crestron Home", () => {
  assert.equal(defaultProjectSystem("residencial", "crestron-home").mode, "central");
  assert.equal(defaultProjectSystem("residencial", "crestron-home").location, "closet");
  assert.equal(defaultProjectSystem("corporativo", "crestron-pro").mode, "per-room");
  assert.equal(defaultProjectSystem("corporativo", "crestron-home").mode, "central");
});

test("Crestron Home: el procesador siempre es central, aunque el ambiente vaya por su cuenta", () => {
  const sys = { ...defaultProjectSystem("residencial", "crestron-home"), ownRooms: ["sala"] };
  assert.deepEqual(centralizedFor(sys, "living"), { audio: true, control: true });
  assert.deepEqual(centralizedFor(sys, "sala"), { audio: false, control: true });
  const pro = defaultProjectSystem("corporativo", "crestron-pro");
  assert.deepEqual(centralizedFor(pro, "sala"), { audio: false, control: false });
});

test("los canales se suman por ambiente (no se comparten) y respetan las unidades", () => {
  // Living 6 parlantes de 8 Ω (3 canales a 4 Ω), comedor 4 (2), suite ×3 con 2 (1 cada una).
  const rooms = [room("living", 6), room("comedor", 4), room("suite", 2, { unitCount: 3 })];
  const t = projectTotals(rooms);
  assert.equal(t.channels, 3 + 2 + 3);
  assert.equal(t.speakers, 6 + 4 + 6);
  assert.equal(t.zones, 5);
});

test("ambiente por su cuenta no suma al central", () => {
  const rooms = [room("living", 6), room("sala", 4, { centralized: { audio: false, control: true } })];
  assert.equal(projectTotals(rooms).channels, 3);
});

test("sin amplificador central: error con los canales a cubrir", () => {
  const sys = defaultProjectSystem("residencial", "crestron-home");
  const { findings } = checkProjectSystem(sys, [room("a", 6), room("b", 6)], []);
  const amp = findings.find((f) => f.id === "central-amp-missing");
  assert.ok(amp);
  assert.equal(amp.requirement?.kind === "amplifier" && amp.requirement.minChannels, 6);
  assert.ok(findings.some((f) => f.id === "central-processor-missing"));
});

test("con amplificador de 8 canales alcanza; si faltan, lo dice", () => {
  const sys = defaultProjectSystem("residencial", "crestron-home");
  const amp: CentralDevice = { slotKey: "central_amp", quantity: 1, label: "AMP", spec: spec({ kind: "amplifier", channels: 8, minOhms: 4, networked: true }) };
  const proc: CentralDevice = { slotKey: "central_processor", quantity: 1, label: "CP4-R", spec: spec({ kind: "processor", networked: true }) };
  const ok = checkProjectSystem(sys, [room("a", 6), room("b", 6)], [amp, proc]);
  assert.ok(ok.findings.some((f) => f.id === "central-amp-ok"));
  const short = checkProjectSystem(sys, [room("a", 10), room("b", 10)], [amp, proc]);
  assert.ok(short.findings.some((f) => f.id === "central-amp-short"));
});

test("unidades de un amplificador para cubrir los canales", () => {
  assert.equal(unitsFor(10, 8), 2);
  assert.equal(unitsFor(8, 8), 1);
  assert.equal(unitsFor(0, 8), 1);
});

test("configuración guardada: valida y completa con la recomendación", () => {
  const fb = defaultProjectSystem("residencial", "crestron-home");
  const s = normalizeProjectSystem({ mode: "per-room", location: "x", control: "zzz", ownRooms: ["a", 3] }, fb);
  assert.equal(s.mode, "per-room");
  assert.equal(s.location, fb.location);
  assert.equal(s.control, "crestron-home");
  assert.deepEqual(s.ownRooms, ["a"]);
});
