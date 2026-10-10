/**
 * Librería de equipos genéricos del Room Builder: lo que falta en el catálogo
 * (motor de cortina, TV, proyector, matriz…) se agrega como equipo genérico
 * con sus conexiones típicas para poder cablearlo y cotizarlo. No son
 * productos del catálogo: viven solo en el proyecto y en su cotización, con
 * precio y descripción a completar.
 */

import type { DeviceClass } from "../device-ports";
import type { IoCapabilities, IoDirection, IoPort, IoSignal, WirelessLink } from "../io-profile/types";
import type { DesignRole, MountOption } from "../types";

export const GENERIC_CATEGORIES = ["Video", "Audio", "Control y automatización", "Red", "Conectividad"] as const;
export type GenericCategory = (typeof GENERIC_CATEGORIES)[number];

export type GenericTemplate = {
  key: string;
  name: string;
  category: GenericCategory;
  role: DesignRole;
  cls: DeviceClass;
  mount: MountOption;
  /** Qué es y qué conexiones trae, para el que arma el proyecto. */
  hint: string;
  ports: IoPort[];
  capabilities: IoCapabilities;
};

/** Cita de los puertos de un genérico: no vienen de una ficha, vienen de la plantilla. */
export const GENERIC_EVIDENCE = "Equipo genérico (plantilla Soundtec): conexiones típicas, a confirmar con el modelo elegido.";

type P = [IoSignal, IoDirection, number, string, string?, ("pd" | "pse")?];
const ports = (...list: P[]): IoPort[] =>
  list.map(([signal, direction, count, label, connector, poe]) => ({ signal, direction, count, label, connector: connector ?? null, channels: null, poe: poe ?? null, evidence: GENERIC_EVIDENCE }));
const wireless = (...links: WirelessLink[]): IoCapabilities => ({ wireless: { value: links, evidence: GENERIC_EVIDENCE } });
const ev = <T>(value: T) => ({ value, evidence: GENERIC_EVIDENCE });

export const GENERIC_LIBRARY: GenericTemplate[] = [
  // Video
  { key: "tv", name: "TV / display genérico", category: "Video", role: "display", cls: "display", mount: "wall", hint: "Smart TV o display profesional: HDMI, red y control.", ports: ports(["hdmi", "in", 3, "HDMI IN 1-3", "HDMI Type A"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232"], ["digital-audio", "out", 1, "Optical OUT", "TOSLINK"]), capabilities: { ...wireless({ protocol: "ir-remote", role: "receiver", capacity: null }), controlProtocols: ev(["IP", "RS-232", "IR", "CEC"]) } },
  { key: "projector", name: "Proyector genérico", category: "Video", role: "display", cls: "display", mount: "ceiling", hint: "Proyector con HDMI, HDBaseT y control.", ports: ports(["hdmi", "in", 2, "HDMI IN 1-2", "HDMI Type A"], ["hdbaset", "in", 1, "HDBaseT IN", "RJ-45"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232", "DB9"]), capabilities: { controlProtocols: ev(["IP", "RS-232", "IR"]) } },
  { key: "projection-screen", name: "Pantalla de proyección motorizada", category: "Video", role: "display", cls: "other", mount: "ceiling", hint: "Pantalla con motor: se controla por contacto seco o RS-232.", ports: ports(["relay", "in", 1, "Control de motor (contacto seco)", "Bornera"], ["rs232", "bidir", 1, "RS-232"]), capabilities: {} },
  { key: "matrix-4x4", name: "Matriz HDMI 4x4", category: "Video", role: "processor", cls: "video-switch", mount: "rack", hint: "Matriz HDMI con control IP/RS-232.", ports: ports(["hdmi", "in", 4, "HDMI IN 1-4", "HDMI Type A"], ["hdmi", "out", 4, "HDMI OUT 1-4", "HDMI Type A"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232"], ["ir", "in", 1, "IR IN", "3,5 mm"]), capabilities: { controlProtocols: ev(["IP", "RS-232", "IR"]) } },
  { key: "matrix-8x8", name: "Matriz HDMI 8x8", category: "Video", role: "processor", cls: "video-switch", mount: "rack", hint: "Matriz HDMI grande con control IP/RS-232.", ports: ports(["hdmi", "in", 8, "HDMI IN 1-8", "HDMI Type A"], ["hdmi", "out", 8, "HDMI OUT 1-8", "HDMI Type A"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232"]), capabilities: { controlProtocols: ev(["IP", "RS-232"]) } },
  { key: "presentation-switcher", name: "Switcher de presentación 4x1", category: "Video", role: "processor", cls: "video-switch", mount: "table", hint: "Switcher con HDMI, USB-C y salida HDBaseT.", ports: ports(["hdmi", "in", 3, "HDMI IN 1-3", "HDMI Type A"], ["usb-c", "in", 1, "USB-C IN", "USB-C"], ["hdmi", "out", 1, "HDMI OUT", "HDMI Type A"], ["hdbaset", "out", 1, "HDBaseT OUT", "RJ-45"], ["analog-audio", "out", 1, "Audio OUT", "Phoenix"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232"]), capabilities: { controlProtocols: ev(["IP", "RS-232"]) } },
  { key: "hdbaset-tx", name: "Extensor HDBaseT (transmisor)", category: "Video", role: "other", cls: "other", mount: "table", hint: "Lleva HDMI, control y PoH por un cable de red.", ports: ports(["hdmi", "in", 1, "HDMI IN", "HDMI Type A"], ["hdbaset", "out", 1, "HDBaseT OUT", "RJ-45"], ["rs232", "bidir", 1, "RS-232"], ["ir", "bidir", 1, "IR", "3,5 mm"]), capabilities: {} },
  { key: "hdbaset-rx", name: "Extensor HDBaseT (receptor)", category: "Video", role: "other", cls: "other", mount: "wall", hint: "Recibe HDBaseT y entrega HDMI al display.", ports: ports(["hdbaset", "in", 1, "HDBaseT IN", "RJ-45"], ["hdmi", "out", 1, "HDMI OUT", "HDMI Type A"], ["rs232", "bidir", 1, "RS-232"], ["ir", "bidir", 1, "IR", "3,5 mm"]), capabilities: {} },
  { key: "media-player", name: "Reproductor / streaming (Apple TV o similar)", category: "Video", role: "other", cls: "source", mount: "rack", hint: "Fuente HDMI con red cableada y Wi-Fi.", ports: ports(["hdmi", "out", 1, "HDMI OUT", "HDMI Type A"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: { ...wireless({ protocol: "wifi", role: "client", capacity: null }, { protocol: "airplay", role: "base", capacity: null }), controlProtocols: ev(["IP", "IR"]) } },
  { key: "audio-streamer", name: "Streamer de audio (música funcional)", category: "Audio", role: "processor", cls: "streamer", mount: "rack", hint: "Fuente de música por red con salida de línea para el amplificador.", ports: ports(["analog-audio", "out", 2, "LINE OUT 1-2", "RCA"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: { ...wireless({ protocol: "wifi", role: "client", capacity: null }, { protocol: "airplay", role: "base", capacity: null }, { protocol: "bluetooth", role: "client", capacity: null }), controlProtocols: ev(["IP"]) } },
  { key: "wireless-presentation", name: "Presentación inalámbrica (base)", category: "Video", role: "other", cls: "source", mount: "table", hint: "Base tipo AirMedia/ClickShare: comparten pantalla desde notebook o celular sin cables.", ports: ports(["hdmi", "out", 1, "HDMI OUT", "HDMI Type A"], ["hdmi", "in", 1, "HDMI IN (pasante)", "HDMI Type A"], ["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"], ["usb-a", "bidir", 2, "USB 1-2", "USB-A"]), capabilities: { ...wireless({ protocol: "wireless-presentation", role: "base", capacity: 8 }, { protocol: "wifi", role: "access-point", capacity: null }, { protocol: "airplay", role: "base", capacity: null }, { protocol: "chromecast", role: "base", capacity: null }), poeStandard: ev("802.3at") } },
  { key: "wireless-presentation-button", name: "Botón de presentación inalámbrica", category: "Video", role: "other", cls: "other", mount: "table", hint: "Transmisor USB-C/HDMI que se enchufa a la notebook y comparte a la base.", ports: ports(["usb-c", "bidir", 1, "USB-C", "USB-C"]), capabilities: wireless({ protocol: "wireless-presentation", role: "transmitter", capacity: null }) },
  { key: "room-pc", name: "PC de sala / UC", category: "Video", role: "codec", cls: "codec", mount: "table", hint: "PC para videoconferencia: video a pantallas y USB a cámara y audio.", ports: ports(["hdmi", "out", 2, "HDMI OUT 1-2", "HDMI Type A"], ["usb-a", "bidir", 4, "USB-A 1-4", "USB-A"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: wireless({ protocol: "wifi", role: "client", capacity: null }, { protocol: "bluetooth", role: "client", capacity: null }) },
  { key: "ptz-camera", name: "Cámara PTZ genérica", category: "Video", role: "camera", cls: "camera", mount: "wall", hint: "Cámara con HDMI, USB y red PoE.", ports: ports(["hdmi", "out", 1, "HDMI OUT", "HDMI Type A"], ["usb-b", "bidir", 1, "USB", "USB-B"], ["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"], ["rs232", "bidir", 1, "RS-232/VISCA"]), capabilities: { poeStandard: ev("802.3at"), controlProtocols: ev(["IP", "RS-232", "USB"]) } },
  { key: "ip-camera", name: "Cámara IP de seguridad", category: "Video", role: "camera", cls: "camera", mount: "ceiling", hint: "Cámara de seguridad PoE.", ports: ports(["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"]), capabilities: { poeStandard: ev("802.3af") } },

  // Audio
  { key: "amp-2ch", name: "Amplificador 2 canales", category: "Audio", role: "processor", cls: "amp", mount: "rack", hint: "Amplificador estéreo para parlantes pasivos.", ports: ports(["analog-audio", "in", 2, "IN L/R", "RCA"], ["speaker", "out", 2, "SPEAKER OUT 1-2", "Bornera"], ["gpio", "in", 1, "Trigger 12 V", "3,5 mm"]), capabilities: { ampChannels: ev(2), lineVoltage: ev("low-z") } },
  { key: "amp-4ch", name: "Amplificador multizona 4 canales", category: "Audio", role: "processor", cls: "amp", mount: "rack", hint: "Amplificador de 4 canales con red.", ports: ports(["analog-audio", "in", 4, "IN 1-4", "Phoenix"], ["speaker", "out", 4, "SPEAKER OUT 1-4", "Phoenix"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: { ampChannels: ev(4), lineVoltage: ev("both"), controlProtocols: ev(["IP"]) } },
  { key: "amp-70v", name: "Amplificador de línea 70/100 V", category: "Audio", role: "processor", cls: "amp", mount: "rack", hint: "Amplificador para música funcional en línea de 70/100 V.", ports: ports(["analog-audio", "in", 2, "IN 1-2", "Phoenix"], ["mic", "in", 1, "MIC IN", "XLR"], ["speaker", "out", 1, "70V/100V OUT", "Bornera"]), capabilities: { ampChannels: ev(1), lineVoltage: ev("both") } },
  { key: "av-receiver", name: "Receiver AV 7.2", category: "Audio", role: "processor", cls: "amp", mount: "rack", hint: "Receiver de cine en casa: HDMI y 7 canales de parlantes.", ports: ports(["hdmi", "in", 6, "HDMI IN 1-6", "HDMI Type A"], ["hdmi", "out", 1, "HDMI OUT (eARC)", "HDMI Type A"], ["speaker", "out", 7, "SPEAKER 1-7", "Bornera"], ["analog-audio", "out", 2, "SUBWOOFER PRE OUT 1-2", "RCA"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: { ampChannels: ev(7), lineVoltage: ev("low-z"), ...wireless({ protocol: "wifi", role: "client", capacity: null }, { protocol: "bluetooth", role: "client", capacity: null }), controlProtocols: ev(["IP", "IR", "CEC"]) } },
  { key: "dsp", name: "Procesador de audio (DSP)", category: "Audio", role: "processor", cls: "dsp", mount: "rack", hint: "DSP con entradas/salidas analógicas y red.", ports: ports(["mic", "in", 8, "IN 1-8", "Phoenix"], ["analog-audio", "out", 8, "OUT 1-8", "Phoenix"], ["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 1, "RS-232"]), capabilities: { controlProtocols: ev(["IP", "RS-232"]) } },
  { key: "ceiling-speaker", name: "Parlante de techo pasivo", category: "Audio", role: "speaker", cls: "speaker", mount: "ceiling", hint: "Parlante de embutir con entrada de parlante.", ports: ports(["speaker", "in", 1, "Entrada de parlante", "Bornera"]), capabilities: { lineVoltage: ev("low-z") } },
  { key: "ceiling-speaker-70v", name: "Parlante de techo 70/100 V", category: "Audio", role: "speaker", cls: "speaker", mount: "ceiling", hint: "Parlante con transformador para línea de 70/100 V.", ports: ports(["speaker", "in", 1, "Entrada de parlante (taps)", "Bornera"]), capabilities: { lineVoltage: ev("both") } },
  { key: "wall-speaker", name: "Parlante de pared pasivo", category: "Audio", role: "speaker", cls: "speaker", mount: "wall", hint: "Parlante de pared o in-wall.", ports: ports(["speaker", "in", 1, "Entrada de parlante", "Bornera"]), capabilities: { lineVoltage: ev("low-z") } },
  { key: "outdoor-speaker", name: "Parlante de exterior", category: "Audio", role: "speaker", cls: "speaker", mount: "wall", hint: "Parlante para exterior / jardín.", ports: ports(["speaker", "in", 1, "Entrada de parlante", "Cable"]), capabilities: { lineVoltage: ev("low-z") } },
  { key: "passive-sub", name: "Subwoofer pasivo", category: "Audio", role: "speaker", cls: "subwoofer", mount: "floor", hint: "Subwoofer sin amplificador: requiere canal de amplificador.", ports: ports(["speaker", "in", 1, "Entrada de parlante", "Bornera"]), capabilities: { lineVoltage: ev("low-z") } },
  { key: "active-sub", name: "Subwoofer activo", category: "Audio", role: "speaker", cls: "subwoofer", mount: "floor", hint: "Subwoofer con amplificador integrado.", ports: ports(["analog-audio", "in", 1, "LFE IN", "RCA"], ["speaker", "in", 1, "Entrada nivel parlante", "Bornera"]), capabilities: {} },
  { key: "soundbar", name: "Barra de sonido", category: "Audio", role: "speaker", cls: "speaker", mount: "wall", hint: "Barra activa con HDMI eARC.", ports: ports(["hdmi", "in", 1, "HDMI eARC", "HDMI Type A"], ["digital-audio", "in", 1, "Optical IN", "TOSLINK"]), capabilities: { ...wireless({ protocol: "bluetooth", role: "client", capacity: null }), controlProtocols: ev(["CEC", "IR"]) } },
  { key: "ceiling-mic", name: "Micrófono de techo Dante", category: "Audio", role: "mic", cls: "mic", mount: "ceiling", hint: "Micrófono de techo por red (Dante/PoE).", ports: ports(["dante", "bidir", 1, "Dante PoE", "RJ-45", "pd"]), capabilities: { poeStandard: ev("802.3af") } },
  { key: "wireless-mic", name: "Micrófono inalámbrico (receptor)", category: "Audio", role: "mic", cls: "mic", mount: "rack", hint: "Receptor de micrófono inalámbrico con salida XLR.", ports: ports(["analog-audio", "out", 1, "AUDIO OUT", "XLR"]), capabilities: wireless({ protocol: "rf-mic", role: "receiver", capacity: 1 }) },

  // Control y automatización
  { key: "control-processor", name: "Procesador de control", category: "Control y automatización", role: "processor", cls: "control", mount: "rack", hint: "Procesador con IP, RS-232, IR, relés y E/S.", ports: ports(["lan", "bidir", 1, "LAN", "RJ-45"], ["rs232", "bidir", 2, "COM 1-2", "Phoenix"], ["ir", "out", 4, "IR 1-4", "Phoenix"], ["relay", "out", 4, "RELAY 1-4", "Phoenix"], ["gpio", "bidir", 4, "I/O 1-4", "Phoenix"]), capabilities: { controlProtocols: ev(["IP", "RS-232", "IR", "Relay"]) } },
  { key: "touch-panel", name: "Panel táctil", category: "Control y automatización", role: "touch", cls: "touch", mount: "wall", hint: "Panel táctil por red PoE.", ports: ports(["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"]), capabilities: { poeStandard: ev("802.3af"), controlProtocols: ev(["IP"]) } },
  { key: "keypad-wired", name: "Teclado cableado", category: "Control y automatización", role: "touch", cls: "touch", mount: "wall", hint: "Teclado de pared por bus de control.", ports: ports(["rs485", "bidir", 1, "Bus de control", "Bornera"]), capabilities: {} },
  { key: "keypad-zigbee", name: "Teclado inalámbrico Zigbee", category: "Control y automatización", role: "touch", cls: "touch", mount: "wall", hint: "Teclado inalámbrico: requiere gateway Zigbee.", ports: ports(["wireless", "bidir", 1, "Zigbee"]), capabilities: wireless({ protocol: "zigbee", role: "client", capacity: null }) },
  { key: "dimmer", name: "Dimmer de iluminación", category: "Control y automatización", role: "other", cls: "control", mount: "wall", hint: "Dimmer de pared controlado por bus.", ports: ports(["rs485", "bidir", 1, "Bus de control", "Bornera"]), capabilities: {} },
  { key: "dimmer-zigbee", name: "Dimmer inalámbrico Zigbee", category: "Control y automatización", role: "other", cls: "control", mount: "wall", hint: "Dimmer inalámbrico: requiere gateway Zigbee.", ports: ports(["wireless", "bidir", 1, "Zigbee"]), capabilities: wireless({ protocol: "zigbee", role: "client", capacity: null }) },
  { key: "relay-module", name: "Módulo de relés 8 canales", category: "Control y automatización", role: "other", cls: "control", mount: "rack", hint: "Relés para cortinas, pantallas, luces.", ports: ports(["relay", "out", 8, "RELAY 1-8", "Bornera"], ["rs485", "bidir", 1, "Bus de control", "Bornera"]), capabilities: {} },
  { key: "shade-motor", name: "Motor de cortina (cableado)", category: "Control y automatización", role: "other", cls: "other", mount: "ceiling", hint: "Motor de cortina con bus RS-485 y contacto seco.", ports: ports(["rs485", "bidir", 1, "RS-485", "RJ-45"], ["relay", "in", 1, "Contacto seco (subir/bajar)", "Bornera"]), capabilities: {} },
  { key: "shade-motor-zigbee", name: "Motor de cortina inalámbrico (Zigbee)", category: "Control y automatización", role: "other", cls: "other", mount: "ceiling", hint: "Motor de cortina a batería o 220 V con radio Zigbee.", ports: ports(["wireless", "bidir", 1, "Zigbee"]), capabilities: wireless({ protocol: "zigbee", role: "client", capacity: null }) },
  { key: "infinet-gateway", name: "Gateway infiNET EX", category: "Control y automatización", role: "other", cls: "control", mount: "ceiling", hint: "Gateway de radio para teclados, dimmers y sensores infiNET EX.", ports: ports(["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"]), capabilities: { ...wireless({ protocol: "infinet", role: "gateway", capacity: 100 }), poeStandard: ev("802.3af") } },
  { key: "zum-bridge", name: "Bridge Zūm Mesh", category: "Control y automatización", role: "other", cls: "control", mount: "ceiling", hint: "Puente de red para teclados y sensores Zūm Mesh.", ports: ports(["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"]), capabilities: { ...wireless({ protocol: "zum-mesh", role: "gateway", capacity: 16 }), poeStandard: ev("802.3af") } },
  { key: "zigbee-gateway", name: "Gateway Zigbee", category: "Control y automatización", role: "other", cls: "control", mount: "ceiling", hint: "Puente entre la red IP y los equipos Zigbee.", ports: ports(["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: wireless({ protocol: "zigbee", role: "gateway", capacity: 100 }) },
  { key: "occupancy-sensor", name: "Sensor de presencia", category: "Control y automatización", role: "other", cls: "other", mount: "ceiling", hint: "Sensor con salida de contacto.", ports: ports(["gpio", "out", 1, "Salida de ocupación", "Bornera"]), capabilities: {} },
  { key: "thermostat", name: "Termostato", category: "Control y automatización", role: "other", cls: "control", mount: "wall", hint: "Termostato con bus de control y relés HVAC.", ports: ports(["rs485", "bidir", 1, "Bus de control", "Bornera"], ["relay", "out", 3, "HVAC 1-3", "Bornera"]), capabilities: {} },
  { key: "ir-emitter", name: "Emisor IR", category: "Control y automatización", role: "other", cls: "other", mount: "wall", hint: "Emisor para controlar equipos por infrarrojo.", ports: ports(["ir", "in", 1, "IR", "3,5 mm"]), capabilities: {} },

  // Red
  { key: "poe-switch-8", name: "Switch PoE 8 puertos", category: "Red", role: "other", cls: "switch", mount: "rack", hint: "Switch administrable con PoE+.", ports: ports(["lan", "bidir", 8, "LAN 1-8 PoE+", "RJ-45", "pse"], ["fiber", "bidir", 2, "SFP 1-2", "SFP"]), capabilities: { poeBudgetWatts: ev(120), poeStandard: ev("802.3at") } },
  { key: "poe-switch-24", name: "Switch PoE 24 puertos", category: "Red", role: "other", cls: "switch", mount: "rack", hint: "Switch administrable con PoE+.", ports: ports(["lan", "bidir", 24, "LAN 1-24 PoE+", "RJ-45", "pse"], ["fiber", "bidir", 4, "SFP 1-4", "SFP"]), capabilities: { poeBudgetWatts: ev(370), poeStandard: ev("802.3at") } },
  { key: "access-point", name: "Access point Wi-Fi", category: "Red", role: "other", cls: "other", mount: "ceiling", hint: "Punto de acceso Wi-Fi alimentado por PoE.", ports: ports(["lan", "bidir", 1, "LAN PoE", "RJ-45", "pd"]), capabilities: { ...wireless({ protocol: "wifi", role: "access-point", capacity: null }), poeStandard: ev("802.3at") } },
  { key: "router", name: "Router / firewall", category: "Red", role: "other", cls: "other", mount: "rack", hint: "Router con WAN y puertos LAN.", ports: ports(["lan", "bidir", 1, "WAN", "RJ-45"], ["lan", "bidir", 4, "LAN 1-4", "RJ-45"]), capabilities: {} },

  // Conectividad
  { key: "table-box", name: "Caja de conexión de mesa", category: "Conectividad", role: "other", cls: "other", mount: "table", hint: "Caja de mesa con HDMI, USB-C y red para la notebook.", ports: ports(["hdmi", "in", 1, "HDMI (notebook)", "HDMI Type A"], ["usb-c", "in", 1, "USB-C (notebook)", "USB-C"], ["hdmi", "out", 1, "HDMI hacia el sistema", "HDMI Type A"], ["lan", "bidir", 1, "LAN", "RJ-45"]), capabilities: {} },
  { key: "wall-plate-hdmi", name: "Placa de pared HDMI + red", category: "Conectividad", role: "other", cls: "other", mount: "wall", hint: "Placa de pared con pasantes HDMI y RJ-45.", ports: ports(["hdmi", "bidir", 1, "HDMI pasante", "HDMI Type A"], ["lan", "bidir", 1, "RJ-45 pasante", "RJ-45"]), capabilities: {} },
];

export const genericByKey = (key: string) => GENERIC_LIBRARY.find((t) => t.key === key) ?? null;

/** Qué genérico cubre un lugar de la plantilla que quedó sin producto (por su nombre y su rol). */
const SLOT_RULES: Array<[RegExp, string]> = [
  [/cortina|persiana|shade|blind|toldo/i, "shade-motor"],
  [/proyector|projector/i, "projector"],
  [/pantalla de proyecci/i, "projection-screen"],
  [/tv|televis|pantalla|display|monitor/i, "tv"],
  [/sub(woofer)?\b/i, "passive-sub"],
  [/exterior|jard[ií]n|outdoor/i, "outdoor-speaker"],
  [/parlante|speaker|altavoz|bafle/i, "ceiling-speaker"],
  [/barra de sonido|soundbar/i, "soundbar"],
  [/receiver|receptor av/i, "av-receiver"],
  [/amplificad|amp\b/i, "amp-4ch"],
  [/dsp|procesador de audio/i, "dsp"],
  [/micr[oó]fono|\bmic/i, "ceiling-mic"],
  [/c[aá]mara|camera/i, "ptz-camera"],
  [/dimmer|ilumin|luz|luces|lighting/i, "dimmer"],
  [/teclado|keypad|botonera/i, "keypad-wired"],
  [/panel t[aá]ctil|touch|tablet/i, "touch-panel"],
  [/termostato|clima|hvac/i, "thermostat"],
  [/sensor|presencia|ocupaci/i, "occupancy-sensor"],
  [/procesador|control/i, "control-processor"],
  [/switch|red\b|network/i, "poe-switch-8"],
  [/access point|wi-?fi|\bap\b/i, "access-point"],
  [/matriz|matrix/i, "matrix-4x4"],
  [/reproductor|streaming|player|apple tv/i, "media-player"],
  [/mesa|conexi[oó]n de mesa|table/i, "table-box"],
];
const ROLE_FALLBACK: Record<string, string> = { display: "tv", speaker: "ceiling-speaker", camera: "ptz-camera", mic: "ceiling-mic", touch: "touch-panel" };

export function genericForSlot(label: string, role: string): string | null {
  for (const [re, key] of SLOT_RULES) if (re.test(label)) return key;
  return ROLE_FALLBACK[role] ?? null;
}

/** Datos del genérico en el proyecto: lo que el usuario completa para cotizar. */
export type GenericInfo = {
  key: string;
  name: string;
  description: string | null;
  priceUsd: number | null;
};

/** Qué falta completar para cotizarlo bien. */
export function genericMissing(g: GenericInfo): string[] {
  const out: string[] = [];
  if (g.priceUsd == null || !(g.priceUsd > 0)) out.push("precio");
  if (!g.description?.trim()) out.push("descripción");
  return out;
}
