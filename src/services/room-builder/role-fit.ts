/**
 * Selección por rol estricta: un producto solo ocupa un lugar de la sala si
 * su tipo y sus conexiones reales (perfil de puertos de la ficha y tipo según
 * la IA) confirman que cumple ese papel. Un gateway inalámbrico no es un
 * procesador de control, una pantalla de reserva de escritorios no es el touch
 * de la sala, un monitor de cartelería sin control no es la pantalla de una
 * sala con control. Si nada del catálogo cumple, va el genérico (nunca un
 * producto de otra categoría).
 *
 * Sin Prisma: se testea con datos armados a mano.
 */

import type { IoCapabilities, IoPort, IoSignal } from "./io-profile/types";
import type { DesignRole, MountOption } from "./types";

/** Papel concreto de un lugar de la sala (más fino que el rol de diseño). */
export type SlotKind =
  | "control-processor"
  | "zone-dsp"
  | "dsp-aec"
  | "dsp-voice"
  | "amplifier"
  | "av-receiver"
  | "codec"
  | "touch-panel"
  | "keypad"
  | "room-display"
  | "signage-display"
  | "speaker"
  | "subwoofer"
  | "wireless-mic"
  | "mic"
  | "camera"
  | "other";

export type FitSlot = { key: string; role: DesignRole | string; mount: MountOption | string; label?: string };

export type FitProduct = {
  name: string;
  brandSlug?: string | null;
  /** Tipo canónico según la IA (speaker, amplifier, control, touchpanel…). */
  productType?: string | null;
  /** INDOOR | OUTDOOR | BOTH | UNKNOWN */
  environment?: string | null;
  /** in-ceiling, in-wall, on-wall, pendant, surface… */
  mountTypes?: string[];
  /** Resumen de la ficha (para capacidades que no son puertos: AEC). */
  summary?: string | null;
  ports: IoPort[];
  caps: IoCapabilities;
};

export type FitContext = {
  /** Control del ambiente (crestron-home | crestron-pro | none). */
  control?: string | null;
  /** Plataforma de videoconferencia (teams | zoom | byod) o null. */
  vcPlatform?: string | null;
  /** Hay videoconferencia en la sala. */
  hasVc?: boolean;
  /** Categoría del ambiente (videoconference, classroom, residential…). */
  category?: string | null;
  /** El lugar es de exterior (jardín, pileta, galería). */
  outdoor?: boolean;
  /** Parlantes pasivos de la sala que tiene que mover el amplificador. */
  speakers?: number | null;
};

/** Canales de amplificación que se aceptan en una sala (más es un equipo de otra escala). */
export const MAX_ROOM_AMP_CHANNELS = 8;
const MAX_EVENT_AMP_CHANNELS = 16;
/** Mínimo de entradas de micrófono / Dante que tiene que tener un DSP de sala. */
const MIN_DSP_MIC_INPUTS = 2;
/** Un receptor AV de cine: al menos 5 canales (5.1) y dos entradas HDMI. */
const MIN_AVR_CHANNELS = 5;
const MIN_AVR_HDMI_IN = 2;
/** Parlantes de baja impedancia que admite un canal (2 en paralelo de 8 Ω = 4 Ω). */
const SPEAKERS_PER_CHANNEL = 2;
/** Potencia mínima por parlante de sala comercial (W). */
const MIN_WATTS_PER_SPEAKER = 15;
/** Packs de varias unidades (se cotizan por unidad, no como un parlante). */
const MULTI_PACK = /\bMP KIT\b|master pack|\bpack\b|\b\d+-?pack\b/i;

const count = (p: FitProduct, signals: IoSignal[], dir: "in" | "out") =>
  p.ports.filter((x) => signals.includes(x.signal) && (x.direction === dir || x.direction === "bidir")).reduce((a, x) => a + (x.count || 0), 0);
const radio = (p: FitProduct, protocol: string, role: string) => (p.caps.wireless?.value ?? []).some((w) => w.protocol === protocol && w.role === role);
const text = (p: FitProduct) => `${p.name} ${p.summary ?? ""}`;
const protocols = (p: FitProduct) => (p.caps.controlProtocols?.value ?? []).map((s) => s.toUpperCase());

/** Procesadores de control reales (corren programa o Crestron Home). */
const CONTROL_PROCESSOR_NAME = /\b(CP4N?|CP4-R|CP4-I|MC4(-R)?(-I)?|MC4-R-HR-\d+|PRO4|RMC4|DIN-AP4(-R)?|AV4|CP3N?|MC3|PRO3|RMC3|DIN-AP3)\b/i;
/** Línea residencial de Crestron (solo Crestron Home). */
const CRESTRON_HOME_LINE = /-R(-I)?\b|-R-/i;
/** Paneles táctiles de control de sala (TSW, TS, TST). */
const TOUCH_PANEL_NAME = /\b(TSW|TS|TST)-\d{3,4}/i;
/** Pantallas de reserva de salas/escritorios, displays con HDMI y controles de mano: no son el touch de la sala. */
const NOT_ROOM_TOUCH = /\bTSS-|\bTSD-|\bTSR-|\bHR-\d|schedul|reserva de|booking/i;
/** Computadoras / kits de sala de videoconferencia (no los kits de actualización). */
const ROOM_COMPUTE_NAME = /\bUC-(C|CX)\d|\bCCC-\d|\bUC-ENGINE\b|\bMTR\b|teams rooms?|zoom rooms?|\bcodec\b|room ?kit|mini ?pc|\bNUC\b/i;
const UPGRADE_KIT = /UPGRD|upgrade|actualizaci[oó]n/i;
/** Evidencia de cancelación de eco acústico en el nombre o la ficha. */
const AEC = /\bAEC\b|cancelaci[oó]n de eco|echo cancel/i;
const DSP_WORDS = /\bdsp\b|procesador (digital )?de (se[nñ]al de )?audio|procesador de audio|mezclador|matriz de audio|tesira|q-?sys|biamp|symetrix|xilica/i;
/** Parlantes Sonance redondos de techo (C6R, VP62R, VX46R, VPXT6R…). */
const ROUND_CEILING_MODEL = /\b[A-Z]{0,4}\d{1,2}R\b/;
const CEILING_ONLY_MOUNTS = new Set(["in-ceiling", "pendant"]);
/** Modelos de techo por nombre (CM31, CS-6R, C6R, IC8): la ficha a veces les suma "in-wall". */
const CEILING_MODEL = /^(CM\d|CS-?\d|C\d|IC\d)|\b(ULTIMATE|REFERENCE) IC\d|ceiling/i;
/** Paneles residenciales Crestron Home (TS-1070R, TSW-770R). */
const RESIDENTIAL_PANEL = /\d{3,4}R(\b|-)/i;

/** Contexto de selección a partir de lo relevado y del tipo de ambiente. */
export function fitContextFor(input: {
  brief: { control?: string | null; vcPlatform?: string | null; systems?: string[]; audio?: { speakerStyle?: string } | null } | null | undefined;
  category?: string | null;
  templateKey?: string | null;
  slotKey?: string | null;
  /** Lugares de la sala (para contar los parlantes que mueve el amplificador). */
  slots?: Array<{ key: string; role: string; defaultQty: number }>;
}): FitContext {
  const speakers = (input.slots ?? []).filter((s) => s.role === "speaker" && !/sub/i.test(s.key)).reduce((n, s) => n + Math.max(0, s.defaultQty), 0);
  const b = input.brief ?? null;
  const outdoor = /outdoor|pool|exterior|jard/i.test(`${input.templateKey ?? ""} ${input.slotKey ?? ""}`) || b?.audio?.speakerStyle === "outdoor";
  return {
    control: b?.control ?? null,
    vcPlatform: b?.vcPlatform ?? null,
    hasVc: Boolean(b?.systems?.includes("vc")),
    category: input.category ?? null,
    outdoor,
    speakers: speakers || null,
  };
}

/** Qué papel cumple un lugar de la sala. */
export function slotKind(slot: FitSlot): SlotKind {
  const key = slot.key.toLowerCase();
  const label = (slot.label ?? "").toLowerCase();
  switch (slot.role) {
    case "codec":
      return "codec";
    case "camera":
      return "camera";
    case "display":
      return /signage|cartel|men[uú]/.test(`${key} ${label}`) ? "signage-display" : "room-display";
    case "touch":
      return /keypad|tecla|teclado/.test(`${key} ${label}`) ? "keypad" : "touch-panel";
    case "mic":
      return /wireless|inal[aá]mbric/.test(`${key} ${label}`) ? "wireless-mic" : "mic";
    case "speaker":
      return /sub/.test(key) ? "subwoofer" : "speaker";
    case "processor":
      if (key === "amp_avr" || /receiver|receptor av|procesador av/.test(label)) return "av-receiver";
      if (/amp/.test(key)) return "amplifier";
      if (key === "dsp" || key.startsWith("dsp_")) return /eco|aec/.test(label) ? "dsp-aec" : "dsp-voice";
      if (/dsp/.test(label)) return "zone-dsp";
      return "control-processor";
    default:
      return "other";
  }
}

/** Una pantalla controlable: red o RS-232 en la ficha. */
export function displayHasControl(p: FitProduct): boolean {
  if (count(p, ["lan", "rs232"], "in") > 0) return true;
  return protocols(p).some((s) => s === "IP" || s === "RS-232" || s === "RS232");
}

/** DSP con cancelación de eco y entradas de micrófono (o Dante) para la sala de videoconferencia. */
export function isAecDsp(p: FitProduct): boolean {
  if (count(p, ["speaker"], "out") > 0) return false;
  const mics = count(p, ["mic", "dante"], "in") + (p.caps.danteRx?.value ?? 0);
  return mics >= MIN_DSP_MIC_INPUTS && AEC.test(text(p));
}

/** DSP de refuerzo de voz: entradas de micrófono y salidas de línea, sin ser un amplificador. */
export function isVoiceDsp(p: FitProduct): boolean {
  if (count(p, ["speaker"], "out") > 0) return false;
  const mics = count(p, ["mic", "dante"], "in") + (p.caps.danteRx?.value ?? 0);
  const outs = count(p, ["analog-audio", "dante"], "out");
  return mics >= MIN_DSP_MIC_INPUTS && outs >= 2 && DSP_WORDS.test(text(p));
}

function ampChannels(p: FitProduct): number {
  return p.caps.ampChannels?.value ?? count(p, ["speaker"], "out");
}

/**
 * Por qué un producto NO puede ocupar un lugar (null = sirve). Las razones se
 * muestran en el selector, así que van en castellano y concretas.
 */
export function roleFitReason(slot: FitSlot, p: FitProduct, ctx: FitContext = {}): string | null {
  const kind = slotKind(slot);
  const type = p.productType ?? null;
  switch (kind) {
    case "control-processor": {
      if (radio(p, "infinet", "gateway") || radio(p, "zigbee", "gateway") || radio(p, "zum-mesh", "gateway")) return "Es un gateway inalámbrico, no un procesador de control";
      if (count(p, ["hdmi", "hdbaset"], "in") > 0 || count(p, ["hdmi"], "out") > 0) return "Es un equipo de video, no un procesador de control";
      if (!CONTROL_PROCESSOR_NAME.test(p.name)) {
        // Sin modelo conocido: tiene que tener red y al menos dos tipos de puerto de control.
        const kinds = (["rs232", "ir", "relay", "cresnet"] as IoSignal[]).filter((s) => count(p, [s], "out") > 0).length;
        if (count(p, ["lan"], "in") === 0 || kinds < 2) return "No corre programa: le faltan puertos de control (RS-232, IR, relés)";
      }
      const crestron = /crestron/i.test(p.brandSlug ?? "") || CONTROL_PROCESSOR_NAME.test(p.name);
      if (crestron && ctx.control === "crestron-home" && !CRESTRON_HOME_LINE.test(p.name)) return "Crestron Home corre solo en los procesadores residenciales (-R)";
      if (crestron && ctx.control === "crestron-pro" && CRESTRON_HOME_LINE.test(p.name)) return "Los procesadores -R son solo para Crestron Home (no se programan)";
      return null;
    }
    case "touch-panel": {
      if (NOT_ROOM_TOUCH.test(p.name)) return "Es una pantalla de reserva o un control de mano, no el panel de control de la sala";
      if (!TOUCH_PANEL_NAME.test(p.name) && type !== "touchpanel") return "No es un panel táctil de control";
      if (count(p, ["lan"], "in") === 0 && !(p.caps.wireless?.value ?? []).length) return "El panel no tiene red ni radio para hablar con el procesador";
      if (ctx.control === "crestron-pro" && (RESIDENTIAL_PANEL.test(p.name) || /para el sistema crestron home/i.test(p.summary ?? ""))) return "Panel de la línea Crestron Home (R): no va con un procesador programado";
      return null;
    }
    case "codec": {
      if (UPGRADE_KIT.test(p.name)) return "Kit de actualización: no es la computadora de la sala";
      if (!ROOM_COMPUTE_NAME.test(text(p))) return "No es un códec ni una PC de sala";
      if (count(p, ["hdmi", "hdbaset"], "out") === 0) return "No tiene salida de video para la pantalla";
      if (ctx.vcPlatform === "teams" && !/(-T\b|-T-|teams)/i.test(text(p))) return "No es para Microsoft Teams Rooms";
      if (ctx.vcPlatform === "zoom" && !/(-Z\b|-Z-|zoom)/i.test(text(p))) return "No es para Zoom Rooms";
      return null;
    }
    case "room-display":
      // La pantalla de una sala se prende, apaga y cambia de entrada desde el sistema (o al menos por red/RS-232).
      return displayHasControl(p) ? null : "Monitor sin control por red ni RS-232 (cartelería): no sirve como pantalla de sala";
    case "amplifier": {
      const ch = ampChannels(p);
      if (ch < 1) return "No tiene salidas de parlante";
      if (count(p, ["hdmi"], "in") > 0) return "Es un receptor AV de cine, no un amplificador de sala";
      const max = ctx.category === "event" ? MAX_EVENT_AMP_CHANNELS : MAX_ROOM_AMP_CHANNELS;
      if (ch > max) return `${ch} canales: es un amplificador de otra escala para esta sala`;
      const spk = ctx.speakers ?? 0;
      if (spk > 0) {
        // Baja impedancia: hasta 2 parlantes por canal; y potencia para los que comparte cada canal.
        if (ch * SPEAKERS_PER_CHANNEL < spk) return `${ch} canal(es) para ${spk} parlantes`;
        const watts = Math.max(0, ...Object.values(p.caps.ampWattsPerChannel?.value ?? {}));
        const perChannel = Math.ceil(spk / ch);
        if (watts > 0 && watts < perChannel * MIN_WATTS_PER_SPEAKER) return `${watts} W por canal no alcanzan para ${perChannel} parlante(s) por canal`;
      }
      return null;
    }
    case "av-receiver": {
      if (ampChannels(p) < MIN_AVR_CHANNELS) return `Menos de ${MIN_AVR_CHANNELS} canales: no arma un 5.1`;
      if (count(p, ["hdmi"], "in") < MIN_AVR_HDMI_IN || count(p, ["hdmi"], "out") < 1) return "No tiene entradas y salida HDMI de receptor AV";
      return null;
    }
    case "dsp-aec":
      return isAecDsp(p) ? null : "No es un DSP con cancelación de eco y entradas de micrófono";
    case "dsp-voice":
      return isVoiceDsp(p) || isAecDsp(p) ? null : "No es un DSP con entradas de micrófono";
    case "wireless-mic":
      return radio(p, "rf-mic", "receiver") ? null : "No es un receptor de micrófono inalámbrico";
    case "speaker": {
      if (type === "subwoofer") return "Es un subwoofer";
      if (MULTI_PACK.test(p.name)) return "Pack de varias unidades: el lugar pide parlantes sueltos";
      if (!ctx.outdoor && (p.environment ?? "").toUpperCase() === "OUTDOOR") return "Parlante de exterior en un ambiente interior";
      const mounts = (p.mountTypes ?? []).map((m) => m.toLowerCase());
      if (slot.mount === "wall") {
        const ceilingOnly = mounts.length > 0 && mounts.every((m) => CEILING_ONLY_MOUNTS.has(m));
        const roundCeiling = /sonance/i.test(p.brandSlug ?? "") && ROUND_CEILING_MODEL.test(p.name) && !mounts.includes("on-wall");
        const ceilingModel = CEILING_MODEL.test(p.name) && !mounts.includes("on-wall");
        if (ceilingOnly || roundCeiling || ceilingModel) return "Parlante de techo: se pidió de pared";
      }
      if (slot.mount === "ceiling" && mounts.length > 0 && !mounts.some((m) => CEILING_ONLY_MOUNTS.has(m) || m === "flush")) return "Parlante de pared: se pidió de techo";
      return null;
    }
    case "subwoofer":
      if (!ctx.outdoor && (p.environment ?? "").toUpperCase() === "OUTDOOR") return "Subwoofer de exterior en un ambiente interior";
      return null;
    default:
      return null;
  }
}
