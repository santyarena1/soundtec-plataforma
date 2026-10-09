/**
 * Lectura de puertos con IA, con criterio de integrador: cada conector físico
 * con su dirección, cantidad, tipo de conector y la cita textual de la ficha.
 * La validación descarta todo lo que no tenga una cita que aparezca en la
 * ficha: el modelo no puede completar con conocimiento general.
 */

import { getSetting } from "@/lib/settings";
import { getOpenAiClient, getOpenAiModel } from "@/services/openai";
import {
  IO_SIGNALS,
  evidenceFound,
  isDirection,
  isIoSignal,
  normalizeForMatch,
  type Evidenced,
  type IoCapabilities,
  type IoPort,
  type IoProfileData,
} from "./types";

export const IO_EXTRACTOR_VERSION = 1;

export const IO_SYSTEM_PROMPT = `Sos un integrador AV senior (Crestron, Shure, Biamp, QSC, Sonance, Kramer, Extron, Samsung, LG, Logitech, Yealink…).
Leés la ficha de UN producto y listás sus conexiones físicas EXACTAMENTE como las declara la ficha, para
diseñar el cableado de una sala. Trabajás SOLO con el texto que te paso: si un dato no está, no va.
Nunca completes con lo que sabés del modelo.

QUÉ LISTAR en "ports" (un ítem por grupo de conectores iguales):
- "signal": uno de [${IO_SIGNALS.join(", ")}].
  · hdmi, displayport, usb-a/usb-b/usb-c, hdbaset (puerto HDBaseT / DM / "DM 8G+" / "DM-lite" sobre RJ-45), sdi, vga.
  · lan: RJ-45 de red/control. Si la ficha dice que es Dante/AES67, usá "dante" (con "channels" si declara canales).
  · analog-audio: entradas/salidas de línea balanceadas o no (Phoenix/Euroblock, RCA, 3,5 mm, XLR de línea).
  · mic: entradas de micrófono (XLR o Phoenix mic/line: si dice "mic/line", es "mic").
  · speaker: salidas de amplificador a parlantes (bornes, Phoenix de potencia). En un PARLANTE pasivo, su entrada de parlante (direction "in").
  · digital-audio: óptico TOSLINK, coaxial S/PDIF, AES3.
  · rs232, rs485, ir (salida IR o puerto IR), relay, gpio (E/S digitales, "I/O", "digital inputs"), cresnet, fiber, wireless (solo si conecta inalámbrico a otro equipo del sistema, p. ej. receptor de micrófono).
  · NO listes alimentación eléctrica, tierra, ranuras de seguridad ni botones.
- "direction": "in" | "out" | "bidir" (USB-B de un dispositivo hacia la PC: "bidir"; RJ-45: "bidir").
- "count": cuántos conectores de ese grupo ("HDMI IN 1-4" = 4; "(2) RS-232" = 2).
- "connector": tipo físico si la ficha lo dice ("HDMI Type A", "RJ-45", "Phoenix 3 pines", "XLR", "TRS 1/4", "RCA", "3,5 mm"), si no null.
- "channels": canales de audio por conector o canales Dante del puerto, si la ficha los da; si no null.
- "poe": "pd" si ese RJ-45 se alimenta por PoE; "pse" si da PoE a otros equipos; si no null.
- "label": rótulo como figura en la ficha ("HDMI OUT", "COM 1-3", "Dante Primary").
- "evidence": copiá TEXTUAL el fragmento de la ficha que lo declara (máximo 180 caracteres, sin cambiar palabras).

CAPACIDADES en "capabilities" (cada una { "value": ..., "evidence": "cita textual" }, o ausente si la ficha no lo dice):
- "danteTx", "danteRx": canales Dante de transmisión/recepción (número).
- "poeWatts": consumo máximo como dispositivo PoE en W; "poeStandard": "802.3af" | "802.3at" | "802.3bt" | "PoE" | "PoE+" | "PoE++" | "Class N".
- "poeBudgetWatts": presupuesto PoE total si es un switch o inyector.
- "maxVideo": resolución/frecuencia máxima ("4K60 4:4:4"); "hdcp": versión ("2.3"); "usbVersion": ("USB 3.0").
- "ampChannels": canales de amplificación; "ampWattsPerChannel": objeto carga→W, p. ej. {"8Ω": 100, "4Ω": 150, "70V": 150}.
- "lineVoltage": "low-z" | "70v" | "100v" | "both" (amplificadores y parlantes).
- "controlProtocols": lista entre ["RS-232", "IP", "IR", "CEC", "Cresnet", "USB", "Relay"] según cómo se lo controla.

"applies": false si el producto no tiene conexiones de señal (soporte, cable, accesorio mecánico); en ese caso "ports" vacío.
"notes": una frase en español si algo es ambiguo (p. ej. "la ficha no detalla el panel trasero"), si no null.

Devolvés SOLO un JSON: { "applies": boolean, "ports": [...], "capabilities": {...}, "notes": string|null }`;

export type RawExtraction = { applies?: unknown; ports?: unknown; capabilities?: unknown; notes?: unknown };

export type ValidatedIo = {
  applies: boolean;
  data: IoProfileData;
  rejected: Array<{ what: string; evidence: string }>;
  /** Parte de lo devuelto que quedó con cita verificada. */
  confidence: number;
  notes: string | null;
};

const MAX_COUNT = 128;
const MAX_CHANNELS = 1024;
const POE_STANDARDS = ["802.3af", "802.3at", "802.3bt", "PoE", "PoE+", "PoE++"];
const CONTROL = ["RS-232", "IP", "IR", "CEC", "Cresnet", "USB", "Relay"];
const LINE_VOLTAGE = ["low-z", "70v", "100v", "both"];

const int = (v: unknown, max: number): number | null => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= max ? Math.round(n) : null;
};
const str = (v: unknown, max = 200): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** Filtra la salida del modelo: vocabulario cerrado y cita verificada en la ficha. */
export function validateExtraction(raw: RawExtraction, sourceText: string): ValidatedIo {
  const source = normalizeForMatch(sourceText);
  const rejected: ValidatedIo["rejected"] = [];
  let offered = 0;
  let kept = 0;

  const ports: IoPort[] = [];
  for (const p of Array.isArray(raw.ports) ? raw.ports : []) {
    const r = (p ?? {}) as Record<string, unknown>;
    const evidence = str(r.evidence, 240) ?? "";
    const signal = r.signal;
    const count = int(r.count, MAX_COUNT);
    offered++;
    if (!isIoSignal(signal) || !isDirection(r.direction) || !count) {
      rejected.push({ what: `puerto inválido ${String(signal)}`, evidence });
      continue;
    }
    if (!evidenceFound(evidence, source)) {
      rejected.push({ what: `${signal} ${String(r.label ?? "")}`.trim(), evidence });
      continue;
    }
    kept++;
    ports.push({
      signal,
      direction: r.direction,
      count,
      connector: str(r.connector, 60),
      channels: int(r.channels, MAX_CHANNELS),
      poe: r.poe === "pd" || r.poe === "pse" ? r.poe : null,
      label: str(r.label, 80) ?? signal,
      evidence,
    });
  }

  const capabilities: IoCapabilities = {};
  const caps = (raw.capabilities ?? {}) as Record<string, unknown>;
  const take = <T>(key: keyof IoCapabilities, parse: (v: unknown) => T | null) => {
    const c = caps[key];
    if (!c || typeof c !== "object") return;
    const o = c as Record<string, unknown>;
    const value = parse(o.value);
    const evidence = str(o.evidence, 240) ?? "";
    offered++;
    if (value == null) {
      rejected.push({ what: `${key} inválido`, evidence });
      return;
    }
    if (!evidenceFound(evidence, source)) {
      rejected.push({ what: key, evidence });
      return;
    }
    kept++;
    (capabilities as Record<string, Evidenced<T>>)[key] = { value, evidence };
  };
  take("danteTx", (v) => int(v, MAX_CHANNELS));
  take("danteRx", (v) => int(v, MAX_CHANNELS));
  take("poeWatts", (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 100 ? n : null;
  });
  take("poeStandard", (v) => {
    const s = str(v, 20);
    return s && (POE_STANDARDS.includes(s) || /^class \d$/i.test(s)) ? s : null;
  });
  take("poeBudgetWatts", (v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 && n <= 6000 ? n : null;
  });
  take("maxVideo", (v) => str(v, 40));
  take("hdcp", (v) => str(v, 10));
  take("usbVersion", (v) => str(v, 20));
  take("ampChannels", (v) => int(v, 64));
  take("ampWattsPerChannel", (v) => {
    if (!v || typeof v !== "object") return null;
    const out: Record<string, number> = {};
    for (const [k, w] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(w);
      if (Number.isFinite(n) && n > 0 && n <= 5000 && k.length <= 8) out[k] = n;
    }
    return Object.keys(out).length ? out : null;
  });
  take("lineVoltage", (v) => (typeof v === "string" && LINE_VOLTAGE.includes(v) ? v : null));
  take("controlProtocols", (v) => {
    const list = Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && CONTROL.includes(x)) : [];
    return list.length ? [...new Set(list)] : null;
  });

  const applies = raw.applies !== false || ports.length > 0;
  return { applies, data: { ports, capabilities }, rejected, confidence: offered ? Math.round((kept / offered) * 100) / 100 : applies ? 0 : 1, notes: str(raw.notes, 300) };
}

/** Modelo para leer fichas: el de `ai.io.model` si está configurado, si no el general. */
export async function ioModel(): Promise<string> {
  return (await getSetting("ai.io.model", "")) || getOpenAiModel();
}

export async function extractIo(input: { brand: string | null; name: string; model: string | null; sourceText: string }) {
  const client = await getOpenAiClient();
  if (!client) throw new Error("OpenAI no está configurado");
  const model = await ioModel();
  const res = await client.chat.completions.create({
    model,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: IO_SYSTEM_PROMPT },
      { role: "user", content: `PRODUCTO: ${[input.brand, input.name, input.model ? `(modelo ${input.model})` : ""].filter(Boolean).join(" ")}\n\n${input.sourceText}` },
    ],
  });
  const content = res.choices[0]?.message?.content ?? "{}";
  let raw: RawExtraction = {};
  try {
    raw = JSON.parse(content) as RawExtraction;
  } catch {
    raw = {};
  }
  return { result: validateExtraction(raw, input.sourceText), model, inputTokens: res.usage?.prompt_tokens ?? 0, outputTokens: res.usage?.completion_tokens ?? 0 };
}
