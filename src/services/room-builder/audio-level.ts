/**
 * Nivel y formato del audio de un puerto, como lo revisa un integrador antes
 * de tender un cable: un micrófono (nivel mic) necesita un preamplificador
 * (entrada mic o mic/line); una salida de línea va a una entrada de línea o
 * mic/line; el óptico solo entra en óptico y el coaxial en coaxial. Entre
 * digital y analógico hace falta un conversor (DAC / ADC).
 */

import type { IoDirection, IoSignal } from "./io-profile/types";

/** mic: nivel micrófono · line: nivel línea · mic-line: admite los dos · optical / coaxial / digital (S/PDIF sin detalle). */
export type AudioKind = "mic" | "line" | "mic-line" | "optical" | "coaxial" | "digital";

export const AUDIO_KIND_LABEL: Record<AudioKind, string> = {
  mic: "nivel micrófono",
  line: "nivel línea",
  "mic-line": "mic/línea",
  optical: "digital óptico (TOSLINK)",
  coaxial: "digital coaxial (S/PDIF)",
  digital: "audio digital S/PDIF",
};

type AudioPortLike = { signal: IoSignal; direction: IoDirection; label?: string | null; connector?: string | null; evidence?: string | null };

const LINE_WORD = /\bline\b|l[ií]nea/i;
const MIC_LEVEL = /mic(rophone)?[- ]?level|nivel (de )?micr[oó]fono/i;
const OPTICAL = /opt(ical)?\b|óptic|optic|toslink/i;
const COAXIAL = /coax|\brca\b|\bbnc\b/i;

/** Nivel/formato de un puerto de audio (null si el puerto no es de audio analógico ni digital). */
export function audioKindOf(p: AudioPortLike): AudioKind | null {
  const text = [p.label, p.connector, p.evidence].filter(Boolean).join(" ");
  if (p.signal === "digital-audio") {
    if (OPTICAL.test(text)) return "optical";
    if (COAXIAL.test(text)) return "coaxial";
    return "digital";
  }
  if (p.signal === "mic") {
    // Entrada de micrófono: si la ficha dice "mic/line", admite también línea.
    if (LINE_WORD.test(text)) return "mic-line";
    return "mic";
  }
  if (p.signal === "analog-audio") {
    // Entrada analógica rotulada "mic/line": preamplificada.
    if (p.direction !== "out" && /\bmic\b|micr[oó]fono/i.test(text)) return "mic-line";
    if (p.direction === "out" && MIC_LEVEL.test(text)) return "mic";
    return "line";
  }
  return null;
}

export const isDigitalAudio = (k: AudioKind) => k === "optical" || k === "coaxial" || k === "digital";

/** ¿Lo que sale de un puerto puede entrar directo en el otro, sin conversor ni preamplificador? */
export function audioFits(out: AudioKind, input: AudioKind): boolean {
  if (isDigitalAudio(out) !== isDigitalAudio(input)) return false;
  if (isDigitalAudio(out)) return out === "digital" || input === "digital" || out === input;
  if (out === "mic-line" || input === "mic-line") return true;
  return out === input;
}

/** Por qué no conectan y qué resuelve (para avisos del motor y del plano técnico). */
export function audioMismatch(out: AudioKind, input: AudioKind): { text: string; fix: "audio-dac" | "dsp" | null } {
  if (isDigitalAudio(out) && !isDigitalAudio(input)) {
    return { text: `sale ${AUDIO_KIND_LABEL[out]} y la entrada es analógica: hace falta un conversor DAC (digital → analógico)`, fix: "audio-dac" };
  }
  if (!isDigitalAudio(out) && isDigitalAudio(input)) {
    return { text: `sale audio analógico y la entrada es ${AUDIO_KIND_LABEL[input]}: hace falta un conversor ADC (analógico → digital)`, fix: null };
  }
  if (isDigitalAudio(out)) return { text: `${AUDIO_KIND_LABEL[out]} no entra en ${AUDIO_KIND_LABEL[input]}: usar un conversor óptico ↔ coaxial`, fix: null };
  if (out === "mic") return { text: "un micrófono (nivel mic) en una entrada solo de línea suena casi nada: va a una entrada mic o mic/línea (preamplificador o DSP)", fix: "dsp" };
  return { text: "una salida de línea en una entrada solo de micrófono satura: usar una entrada de línea o mic/línea (o un atenuador)", fix: null };
}
