import { test } from "node:test";
import assert from "node:assert/strict";
import { fitContextFor, isAecDsp, roleFitReason, slotKind, type FitProduct, type FitSlot } from "./role-fit";
import type { IoPort, IoSignal } from "./io-profile/types";

/** Producto con los puertos y capacidades tal como quedaron leídos de la ficha (base de prueba). */
function product(name: string, ports: Array<[IoSignal, IoPort["direction"], number, ("pd" | "pse")?]>, extra: Partial<FitProduct> = {}, caps: Record<string, unknown> = {}): FitProduct {
  return {
    name,
    ports: ports.map(([signal, direction, count, poe]) => ({ signal, direction, count, connector: null, channels: null, poe: poe ?? null, label: signal, evidence: "ficha" })),
    caps: Object.fromEntries(Object.entries(caps).map(([k, v]) => [k, { value: v, evidence: "ficha" }])),
    ...extra,
  };
}

// Fichas reales del catálogo (perfil de puertos de la base de prueba).
const CENI_GWEXER = product("CENI-GWEXER", [["lan", "bidir", 1, "pd"], ["usb-b", "bidir", 1]], { brandSlug: "crestron", productType: "control" }, { wireless: [{ protocol: "infinet", role: "gateway", capacity: 100 }] });
const CP4N = product("CP4N", [["lan", "bidir", 2], ["cresnet", "bidir", 1], ["rs232", "bidir", 3], ["ir", "bidir", 8], ["relay", "bidir", 8]], { brandSlug: "crestron", productType: "processor" });
const CP4R = product("CP4-R", [["lan", "bidir", 1], ["rs232", "bidir", 3], ["ir", "bidir", 8], ["relay", "bidir", 8]], { brandSlug: "crestron", productType: "processor" });
const TSS_470E = product("TSS-470E-B-T", [["lan", "bidir", 1], ["usb-a", "bidir", 1], ["usb-c", "bidir", 1]], { brandSlug: "crestron", productType: "touchpanel" });
const TSW_1070 = product("TSW-1070-B-S", [["lan", "bidir", 1], ["usb-a", "bidir", 2]], { brandSlug: "crestron", productType: "touchpanel" });
const DP4000 = product("DP4000 IA", [["analog-audio", "in", 8], ["speaker", "out", 16], ["analog-audio", "out", 1]], { brandSlug: "darts", productType: "amplifier" }, { ampChannels: 16 });
const PZC_504 = product("PowerZone Connect 504", [["analog-audio", "in", 4], ["speaker", "out", 4], ["lan", "bidir", 1]], { brandSlug: "blaze-by-sonance", productType: "amplifier" });
const HT_HV55 = product("HT-HV55", [["hdmi", "in", 2], ["displayport", "in", 1], ["analog-audio", "in", 1], ["analog-audio", "out", 1]], { brandSlug: "hall-tech" }, { wireless: [{ protocol: "ir-remote", role: "receiver", capacity: null }] });
const HT_HV75Q = product("HT-HV75-Q", [["hdmi", "in", 4]], { brandSlug: "hall-tech" });
const PRO_DISPLAY = product("Display profesional 75", [["hdmi", "in", 3], ["rs232", "in", 1], ["lan", "bidir", 1]]);
const DM_NAX_4ZSP = product("DM-NAX-4ZSP", [["digital-audio", "in", 4], ["analog-audio", "in", 4], ["analog-audio", "out", 6], ["lan", "bidir", 2], ["usb-b", "bidir", 1], ["gpio", "bidir", 4]], {
  brandSlug: "crestron",
  productType: "processor",
  summary: "Preamplificador de audio sobre IP para audio multiroom con streaming integrado.",
});
const AEC_DSP = product("DSP de sala 12x8", [["mic", "in", 12], ["analog-audio", "out", 8], ["dante", "bidir", 1]], { productType: "processor", summary: "DSP con cancelación de eco acústico (AEC) en las 12 entradas." });
const DSP_1280 = product("DSP-1280", [["mic", "in", 12], ["analog-audio", "out", 8], ["lan", "bidir", 1]], { productType: "processor", summary: "Procesador de señal de audio digital para salas de reunión." });
const UC_C100_T = product("UC-C100-T", [["lan", "bidir", 1, "pd"], ["hdmi", "in", 1], ["usb-a", "bidir", 1], ["hdmi", "out", 2]], { summary: "Kit de integración para Microsoft Teams Rooms." });
const UPGRADE = product("UC-ENGINE-BRKTX-T-UPGRD", [["hdmi", "out", 2], ["usb-a", "bidir", 2]], { summary: "Kit de actualización para Teams Rooms." });
const C6R = product("C6R SST", [["speaker", "in", 1]], { brandSlug: "sonance", productType: "speaker", environment: "INDOOR", mountTypes: ["in-ceiling", "in-wall"] });
const IS8 = product("IS8", [["speaker", "in", 1]], { brandSlug: "sonance", productType: "speaker", environment: "INDOOR", mountTypes: ["in-wall"] });
const VXXT6R = product("VXXT6R EA", [["speaker", "in", 1]], { brandSlug: "sonance", productType: "speaker", environment: "OUTDOOR", mountTypes: ["in-ceiling"] });

const slot = (key: string, role: string, mount = "rack", label = ""): FitSlot => ({ key, role, mount, label });
const PROCESSOR = slot("processor", "processor", "rack", "Procesador de control");
const TOUCH = slot("touch_table", "touch", "table", "Touch de control");
const AMP = slot("amplifier", "processor", "rack", "Amplificador");
const SCREEN = slot("display_main", "display", "wall", "Display principal");
const DSP_AEC = slot("dsp", "processor", "rack", "Procesador de audio con cancelación de eco (DSP)");
const CODEC = slot("codec", "codec", "rack", "PC / códec de sala");

test("procesador de control: un gateway infiNET (CENI-GWEXER) no ocupa el lugar; un CP4N sí", () => {
  assert.match(roleFitReason(PROCESSOR, CENI_GWEXER, { control: "crestron-pro" }) ?? "", /gateway/);
  assert.equal(roleFitReason(PROCESSOR, CP4N, { control: "crestron-pro" }), null);
});

test("procesador de control: Crestron Home solo con la línea -R y programado solo con la estándar", () => {
  assert.equal(roleFitReason(PROCESSOR, CP4R, { control: "crestron-home" }), null);
  assert.match(roleFitReason(PROCESSOR, CP4N, { control: "crestron-home" }) ?? "", /-R/);
  assert.match(roleFitReason(PROCESSOR, CP4R, { control: "crestron-pro" }) ?? "", /Crestron Home/);
});

test("touch de sala: la pantalla de reserva TSS-470E no sirve; un TSW-1070 sí", () => {
  assert.match(roleFitReason(TOUCH, TSS_470E) ?? "", /reserva/);
  assert.equal(roleFitReason(TOUCH, TSW_1070), null);
  // Con Crestron programado, los paneles de la línea Crestron Home (R) no van.
  const TS_1070R = product("TS-1070R-W", [["lan", "bidir", 1], ["usb-a", "bidir", 1]], { brandSlug: "crestron", productType: "touchpanel" });
  assert.match(roleFitReason(TOUCH, TS_1070R, { control: "crestron-pro" }) ?? "", /Crestron Home/);
  assert.equal(roleFitReason(TOUCH, TS_1070R, { control: "crestron-home" }), null);
});

test("amplificador de sala: el DP4000 de 16 canales (cine) se rechaza; un 4 canales comercial pasa", () => {
  assert.match(roleFitReason(AMP, DP4000, { category: "videoconference" }) ?? "", /16 canales/);
  assert.match(roleFitReason(AMP, DP4000, { category: "classroom" }) ?? "", /16 canales/);
  assert.equal(roleFitReason(AMP, PZC_504, { category: "classroom" }), null);
  // Canales y potencia acordes a los parlantes de la sala (SA202: 2 × 20 W para 4 parlantes no alcanza).
  const SA202 = product("SA202-II-RDT", [["analog-audio", "in", 2], ["speaker", "out", 1]], { productType: "amplifier" }, { ampChannels: 2, ampWattsPerChannel: { "4Ω": 20, "8Ω": 10 } });
  assert.match(roleFitReason(AMP, SA202, { category: "videoconference", speakers: 4 }) ?? "", /W por canal/);
  assert.match(roleFitReason(AMP, PZC_504, { category: "classroom", speakers: 10 }) ?? "", /4 canal/);
  assert.equal(roleFitReason(AMP, PZC_504, { category: "classroom", speakers: 8 }), null);
});

test("parlantes: un pack de 8 unidades no ocupa el lugar de un parlante", () => {
  const pack = product("CM31-EZ-WH MP KIT", [["speaker", "in", 1]], { productType: "speaker", environment: "BOTH", mountTypes: ["in-ceiling"] });
  assert.match(roleFitReason(slot("speakers", "speaker", "ceiling"), pack) ?? "", /Pack/);
});

test("pantalla de sala: los monitores de cartelería HT-HV55 / HT-HV75-Q (solo HDMI + IR) se rechazan", () => {
  assert.match(roleFitReason(SCREEN, HT_HV55, { control: "crestron-pro" }) ?? "", /cartelería/);
  assert.match(roleFitReason(SCREEN, HT_HV75Q, { control: "none" }) ?? "", /cartelería/);
  assert.equal(roleFitReason(SCREEN, PRO_DISPLAY, { control: "crestron-pro" }), null);
  // En un lugar de cartelería sí sirven.
  assert.equal(roleFitReason(slot("signage", "display", "wall", "Signage"), HT_HV55), null);
});

test("DSP para micrófonos: el DM-NAX-4ZSP (preamplificador sin AEC ni entradas de micrófono) se rechaza", () => {
  assert.equal(isAecDsp(DM_NAX_4ZSP), false);
  assert.ok(roleFitReason(DSP_AEC, DM_NAX_4ZSP));
  // Un DSP sin cancelación de eco tampoco resuelve la sala de videoconferencia.
  assert.ok(roleFitReason(DSP_AEC, DSP_1280));
  assert.equal(roleFitReason(DSP_AEC, AEC_DSP), null);
  // Para refuerzo de voz en un aula, el DSP-1280 sí sirve.
  assert.equal(roleFitReason(slot("dsp", "processor", "rack", "Procesador de audio (refuerzo de voz)"), DSP_1280), null);
});

test("códec de sala: el kit de la plataforma pedida; no un kit de actualización ni el de otra plataforma", () => {
  assert.equal(roleFitReason(CODEC, UC_C100_T, { vcPlatform: "teams" }), null);
  assert.match(roleFitReason(CODEC, UC_C100_T, { vcPlatform: "zoom" }) ?? "", /Zoom/);
  assert.match(roleFitReason(CODEC, UPGRADE, { vcPlatform: "teams" }) ?? "", /actualización/);
  assert.ok(roleFitReason(CODEC, CENI_GWEXER, { vcPlatform: "teams" }));
});

test("parlantes: de pared cuando se pidió de pared, y nada de exterior en un aula", () => {
  const wall = slot("speakers", "speaker", "wall", "Parlantes de pared");
  assert.match(roleFitReason(wall, C6R) ?? "", /techo/);
  assert.equal(roleFitReason(wall, IS8), null);
  const ceiling = slot("speakers", "speaker", "ceiling", "Parlantes de techo");
  assert.match(roleFitReason(ceiling, VXXT6R, fitContextFor({ brief: null, category: "classroom", templateKey: "classroom-m", slotKey: "speakers" })) ?? "", /exterior/);
  assert.equal(roleFitReason(ceiling, VXXT6R, fitContextFor({ brief: null, category: "hotel", templateKey: "hotel-pool-bar-m", slotKey: "speakers_outdoor" })), null);
});

test("cada lugar tiene su papel", () => {
  assert.equal(slotKind(PROCESSOR), "control-processor");
  assert.equal(slotKind(AMP), "amplifier");
  assert.equal(slotKind(slot("amp_avr", "processor", "rack", "Receptor / procesador AV")), "av-receiver");
  assert.equal(slotKind(DSP_AEC), "dsp-aec");
  assert.equal(slotKind(slot("lighting_keypad", "touch", "wall", "Teclas de iluminación")), "keypad");
  assert.equal(slotKind(slot("mic_wireless", "mic", "rack", "Micrófono inalámbrico del docente")), "wireless-mic");
});
