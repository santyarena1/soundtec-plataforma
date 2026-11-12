/**
 * Cadena de señal completa por tipo de sala, como la arma un integrador:
 *
 * - Videoconferencia: PC/códec de la plataforma (Teams/Zoom; en BYOD la
 *   notebook entra por la conexión de mesa), DSP con cancelación de eco para
 *   los micrófonos, cámara al códec, pantalla y el audio de la llamada a los
 *   parlantes (con su amplificador).
 * - Aula / capacitación: micrófono inalámbrico del docente, DSP de refuerzo
 *   de voz, conexión de mesa para la notebook (HDMI + USB-C) y la pantalla o
 *   proyector. Los micrófonos de techo solo si hay videoconferencia.
 * - Cine en casa: receptor/procesador AV, parlantes L/C/R al frente, envolventes
 *   según 5.1/7.1, subwoofer y la fuente que entra al receptor.
 *
 * Nunca suma lo que nadie pidió: la presentación inalámbrica y el micrófono
 * inalámbrico salen de las respuestas del asistente.
 */

import type { RoomBrief, RoomDims } from "./brief";
import { rackAnchor } from "./rack-place";
import { codecBehindDisplay } from "./vc-table";
import type { Pose, RoomSlot } from "./types";

const WALL = 0.08;
const r2 = (n: number) => Math.round(n * 100) / 100;
const pose = (x: number, y: number, z: number, rotY = 0): Pose => ({ x: r2(x), y: r2(y), z: r2(z), rotY });

/** Plantillas de enseñanza (aula y capacitación). */
const TEACHING_TEMPLATES = new Set(["classroom-m", "training-l"]);
export const CINEMA_TEMPLATE = "residential-cinema-m";
/** Personas por micrófono de techo (array tipo MXA / TCC). */
const PEOPLE_PER_CEILING_MIC = 8;
const MAX_CEILING_MICS = 8;
/** Superficie desde la que un cine va a 7.1 si no se eligió el formato. */
const CINEMA_71_FROM_M2 = 30;

export type ChainFlags = { vc: boolean; teaching: boolean; cinema: boolean };

export function chainFlags(templateKey: string, brief: RoomBrief): ChainFlags {
  const has = (s: string) => brief.systems.includes(s as never);
  return {
    vc: has("vc"),
    teaching: TEACHING_TEMPLATES.has(templateKey),
    cinema: templateKey === CINEMA_TEMPLATE || (has("audio") && brief.audio?.use === "cinema"),
  };
}

/** En aulas el micrófono inalámbrico va salvo que se diga que no (lo pregunta el asistente). */
export function wantsWirelessMic(flags: ChainFlags, brief: RoomBrief): boolean {
  return brief.wirelessMic ?? flags.teaching;
}

function upsert(list: RoomSlot[], slot: RoomSlot): RoomSlot[] {
  return list.some((s) => s.key === slot.key) ? list.map((s) => (s.key === slot.key ? { ...s, ...slot } : s)) : [...list, slot];
}

/** Formato de cine elegido o el que corresponde al tamaño. */
export function cinemaLayoutFor(brief: RoomBrief, areaM2: number): "5.1" | "7.1" {
  return brief.audio?.layout ?? (areaM2 > CINEMA_71_FROM_M2 ? "7.1" : "5.1");
}

function cinemaSlots(slots: RoomSlot[], brief: RoomBrief, dims: RoomDims): RoomSlot[] {
  const front = dims.depthM / 2 - WALL;
  const back = -dims.depthM / 2 + WALL;
  const left = -dims.widthM / 2 + WALL;
  const right = dims.widthM / 2 - WALL;
  const area = dims.areaM2 && dims.areaM2 > 0 ? dims.areaM2 : dims.widthM * dims.depthM;
  const layout = cinemaLayoutFor(brief, area);
  // Envolventes de techo si así se pidieron los parlantes; si no, de pared a la altura del oído sentado + 0,6 m.
  const ceilingSurround = brief.audio?.speakerStyle === "ceiling" || brief.audio?.speakerStyle === "invisible";
  const surroundY = ceilingSurround ? dims.heightM - 0.05 : Math.min(1.7, dims.heightM - 0.3);
  const sideZ = -dims.depthM * 0.1;
  // Fuera: los parlantes y amplificadores genéricos de la plantilla (el receptor AV amplifica todo).
  let next = slots.filter((s) => s.role !== "speaker" && !(s.role === "processor" && /amp/i.test(s.key)));
  const add = (s: RoomSlot) => {
    next = upsert(next, s);
  };
  add({ key: "speakers_front", role: "speaker", label: "Parlantes frontales L/C/R", required: true, mount: "wall", pose: pose(0, 1.1, front, 180), defaultQty: 3 });
  add({ key: "speakers_surround_l", role: "speaker", label: "Envolvente izquierdo", required: true, mount: ceilingSurround ? "ceiling" : "wall", pose: ceilingSurround ? pose(left + 0.6, surroundY, sideZ) : pose(left, surroundY, sideZ, 90), defaultQty: 1 });
  add({ key: "speakers_surround_r", role: "speaker", label: "Envolvente derecho", required: true, mount: ceilingSurround ? "ceiling" : "wall", pose: ceilingSurround ? pose(right - 0.6, surroundY, sideZ) : pose(right, surroundY, sideZ, -90), defaultQty: 1 });
  if (layout === "7.1") add({ key: "speakers_rear", role: "speaker", label: "Envolventes traseros", required: true, mount: ceilingSurround ? "ceiling" : "wall", pose: ceilingSurround ? pose(0, surroundY, back + 0.6) : pose(0, surroundY, back, 0), defaultQty: 2 });
  add({ key: "subwoofer", role: "speaker", label: "Subwoofer", required: true, mount: "floor", pose: pose(dims.widthM * 0.35, 0, front - 0.3, 180), defaultQty: 1 });
  const rack = rackAnchor(dims);
  add({ key: "amp_avr", role: "processor", label: "Receptor / procesador AV", required: true, mount: "rack", pose: rack, defaultQty: 1 });
  add({ key: "source_video", role: "other", label: "Fuente de video (streaming)", required: true, mount: "rack", pose: rack, defaultQty: 1 });
  return next;
}

/**
 * Completa la cadena de señal de la sala según el tipo y lo relevado.
 * Recibe los lugares ya ajustados por applyBriefToSlots.
 */
export function applySignalChain(slots: RoomSlot[], brief: RoomBrief, dims: RoomDims, templateKey: string): RoomSlot[] {
  const flags = chainFlags(templateKey, brief);
  const front = dims.depthM / 2 - WALL;
  const ceilY = dims.heightM - 0.05;
  const rack = rackAnchor(dims);
  // Mesa: la de reunión (centro) o el escritorio del docente (cerca del frente).
  const tablePose = flags.teaching ? pose(dims.widthM * 0.15, 0.76, front - 1.0) : pose(0.3, 0.76, 0.2);
  let next = [...slots];
  const add = (s: RoomSlot) => {
    next = upsert(next, s);
  };

  if (flags.cinema) next = cinemaSlots(next, brief, dims);

  if (flags.teaching && !flags.vc) {
    // Sin videoconferencia, los micrófonos de techo de la plantilla no tienen a quién mandar la voz.
    next = next.filter((s) => !(s.role === "mic" && s.mount === "ceiling"));
  }

  if (flags.vc) {
    if (brief.vcPlatform === "byod") {
      // BYOD: la notebook de cada uno es el códec; entra por la conexión de mesa (video + USB de cámara y audio).
      next = next.filter((s) => s.role !== "codec");
    } else {
      const platform = brief.vcPlatform === "zoom" ? "Zoom Rooms" : "Microsoft Teams Rooms";
      // Sin rack central: el códec / PC va detrás de la pantalla (VESA), con HDMI y USB cortos.
      // Con rack central del proyecto queda en el mueble técnico, como el resto del equipamiento.
      const display = next.find((s) => s.role === "display");
      const centralRack = Boolean(brief.centralized?.audio || brief.centralized?.control);
      const place = display && !centralRack ? { mount: "wall" as const, pose: codecBehindDisplay(display.pose) } : { mount: "rack" as const, pose: rack };
      next = next.map((s) => (s.role === "codec" ? { ...s, label: `PC / códec de sala (${platform})`, required: true, ...place } : s));
      if (!next.some((s) => s.role === "codec")) add({ key: "codec", role: "codec", label: `PC / códec de sala (${platform})`, required: true, ...place, defaultQty: 1 });
    }
    // Micrófonos de techo según la gente que entra (uno cada ~8 personas).
    if (brief.people) {
      const need = Math.min(MAX_CEILING_MICS, Math.ceil(brief.people / PEOPLE_PER_CEILING_MIC));
      next = next.map((s) => (s.role === "mic" && s.mount === "ceiling" ? { ...s, defaultQty: Math.max(s.defaultQty, need) } : s));
    }
    // El audio de la llamada sale por parlantes de la sala (no por la pantalla).
    if (!next.some((s) => s.role === "speaker")) {
      add({ key: "speakers", role: "speaker", label: "Parlantes (audio de la llamada)", required: true, mount: "ceiling", pose: pose(0, ceilY, dims.depthM * 0.15), defaultQty: 2 });
    } else next = next.map((s) => (s.role === "speaker" ? { ...s, required: true, defaultQty: Math.max(2, s.defaultQty) } : s));
    if (!next.some((s) => s.role === "processor" && /amp/i.test(s.key)) && !brief.centralized?.audio) {
      add({ key: "amplifier", role: "processor", label: "Amplificador", required: true, mount: "rack", pose: rack, defaultQty: 1 });
    }
  }

  const wirelessMic = wantsWirelessMic(flags, brief);
  if (wirelessMic && (flags.teaching || flags.vc)) {
    add({ key: "mic_wireless", role: "mic", label: flags.teaching ? "Micrófono inalámbrico del docente" : "Micrófono inalámbrico", required: true, mount: "rack", pose: rack, defaultQty: 1 });
  }

  const hasMics = next.some((s) => s.role === "mic");
  if (hasMics && (flags.vc || flags.teaching)) {
    add({
      key: "dsp",
      role: "processor",
      label: flags.vc ? "Procesador de audio con cancelación de eco (DSP)" : "Procesador de audio (refuerzo de voz)",
      required: true,
      mount: "rack",
      pose: rack,
      defaultQty: 1,
    });
    // Refuerzo de voz en el aula: parlantes y amplificador aunque no se haya marcado "audio".
    if (flags.teaching && !next.some((s) => s.role === "speaker")) {
      add({ key: "speakers", role: "speaker", label: "Parlantes (refuerzo de voz)", required: true, mount: "ceiling", pose: pose(0, ceilY, dims.depthM * 0.15), defaultQty: 4 });
    }
    if (flags.teaching && !next.some((s) => s.role === "processor" && /amp/i.test(s.key)) && !brief.centralized?.audio) {
      add({ key: "amplifier", role: "processor", label: "Amplificador", required: true, mount: "rack", pose: rack, defaultQty: 1 });
    }
  }

  if (flags.teaching || (flags.vc && brief.vcPlatform === "byod")) {
    add({ key: "table_input", role: "other", label: "Conexión de mesa para notebook (HDMI + USB-C)", required: true, mount: "table", pose: tablePose, defaultQty: 1 });
  }

  if (brief.wirelessPresentation && (flags.vc || flags.teaching || brief.systems.includes("video"))) {
    add({ key: "presentation", role: "other", label: "Presentación inalámbrica", required: true, mount: "rack", pose: rack, defaultQty: 1 });
  }

  return next;
}
