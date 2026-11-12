/**
 * Vocabulario de puertos y capacidades de conexión de un equipo AV, tal como
 * lo describe la ficha del fabricante. Todo valor que viene del modelo se
 * filtra contra estas listas; lo desconocido se descarta.
 */

/** Señal / tipo de puerto (lo que viaja por el conector). */
export const IO_SIGNALS = [
  "hdmi",
  "displayport",
  "usb-a",
  "usb-b",
  "usb-c",
  "hdbaset",
  "sdi",
  "vga",
  "lan",
  "dante",
  "analog-audio",
  "mic",
  "speaker",
  "digital-audio",
  "rs232",
  "rs485",
  "ir",
  "relay",
  "gpio",
  "cresnet",
  "fiber",
  "wireless",
  /** Enlace UTP propietario de una familia (no HDBaseT): solo empareja con la misma familia. */
  "cat-proprietary",
] as const;
export type IoSignal = (typeof IO_SIGNALS)[number];

export const IO_SIGNAL_LABEL: Record<IoSignal, string> = {
  hdmi: "HDMI",
  displayport: "DisplayPort",
  "usb-a": "USB-A",
  "usb-b": "USB-B",
  "usb-c": "USB-C",
  hdbaset: "HDBaseT",
  sdi: "SDI",
  vga: "VGA",
  lan: "Red RJ-45",
  dante: "Dante / AES67",
  "analog-audio": "Audio analógico",
  mic: "Micrófono",
  speaker: "Salida de parlante",
  "digital-audio": "Audio digital (óptico/coaxial)",
  rs232: "RS-232",
  rs485: "RS-485",
  ir: "IR",
  relay: "Relé",
  gpio: "E/S digital (GPIO)",
  cresnet: "Cresnet",
  fiber: "Fibra",
  wireless: "Inalámbrico",
  "cat-proprietary": "Enlace UTP propietario",
};

export type IoDirection = "in" | "out" | "bidir";

export type IoPort = {
  signal: IoSignal;
  direction: IoDirection;
  count: number;
  /** "HDMI Type A", "RJ-45", "Phoenix 3 pines", "XLR", "3,5 mm"… */
  connector: string | null;
  /** Canales por conector (audio) o canales Dante del puerto de red. */
  channels: number | null;
  /** PoE en un RJ-45: pd (lo alimenta el switch) | pse (alimenta a otros). */
  poe: "pd" | "pse" | null;
  /** Rótulo como en la ficha ("HDMI IN 1-4", "COM 1-2"). */
  label: string;
  /** Frase textual de la ficha que lo respalda. */
  evidence: string;
  /**
   * Enlace UTP propietario ("cat-proprietary"): familia del fabricante con la que empareja
   * ("hall-ultra-4k"). Emisor y receptor de familias distintas no se conectan entre sí.
   */
  family?: string | null;
  /** Largo máximo que declara la ficha para este puerto (m), con su cita (que tiene que decir ese largo). */
  maxLengthM?: number | null;
  maxLengthEvidence?: string | null;
};

/** Familia de enlace propietario: minúsculas, números y guiones ("hall-ultra-4k"). */
export const FAMILY_ID = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Familias por puerto: un receptor que acepta más de una ("hall-ultra-v,hall-ultra-4k"). */
const MAX_FAMILIES = 4;

export const familiesOf = (f: string | null | undefined): string[] => (f ?? "").split(",").map((s) => s.trim()).filter(Boolean);
export const validFamily = (f: string): boolean => {
  const list = familiesOf(f);
  return list.length > 0 && list.length <= MAX_FAMILIES && list.every((x) => FAMILY_ID.test(x));
};
/** ¿Dos puertos de enlace propietario se entienden? Comparten al menos una familia. */
export const familiesMatch = (a: string | null | undefined, b: string | null | undefined): boolean => {
  const fa = familiesOf(a);
  return familiesOf(b).some((x) => fa.includes(x));
};

/**
 * ¿La cita dice ese largo? Acepta metros ("100 m", "70 metros") y pies ("328 ft", "230'"),
 * con un 6 % de tolerancia por el redondeo de la conversión.
 */
export function lengthCited(evidence: string, meters: number): boolean {
  const re = /(\d+(?:[.,]\d+)?)\s*(mts?\b|metros?|meters?|metres?|m\b|ft\b|feet|foot|pies|')/gi;
  for (const m of evidence.matchAll(re)) {
    const n = Number(m[1]!.replace(",", "."));
    const value = /^(ft|feet|foot|pies|')$/i.test(m[2]!) ? n * 0.3048 : n;
    if (Math.abs(value - meters) <= meters * 0.06) return true;
  }
  return false;
}

export type Evidenced<T> = { value: T; evidence: string };

export type IoCapabilities = {
  danteTx?: Evidenced<number>;
  danteRx?: Evidenced<number>;
  /** Consumo como dispositivo PoE (W) y clase/estándar. */
  poeWatts?: Evidenced<number>;
  poeStandard?: Evidenced<string>;
  /** Presupuesto PoE total de un switch (W). */
  poeBudgetWatts?: Evidenced<number>;
  maxVideo?: Evidenced<string>;
  hdcp?: Evidenced<string>;
  usbVersion?: Evidenced<string>;
  ampChannels?: Evidenced<number>;
  /** Potencia por canal según carga: "4 Ω": 150… */
  ampWattsPerChannel?: Evidenced<Record<string, number>>;
  /** low-z | 70v | 100v | both */
  lineVoltage?: Evidenced<string>;
  /**
   * Amplificador: potencia por salida PUENTEADA (dos canales juntos: bridged / BTL, o modo
   * Hi-Z que ocupa un par de canales), según carga ("8Ω": 500, "70V": 250). Nunca va en
   * ampWattsPerChannel: si 70V/100V solo está acá, esa salida usa la mitad de los canales.
   */
  ampBridgedWatts?: Evidenced<Record<string, number>>;
  /** Amplificador: carga mínima por canal (Ω) que admite. */
  minLoadOhms?: Evidenced<number>;
  /** Parlante: impedancia nominal en baja impedancia (Ω). */
  impedanceOhms?: Evidenced<number>;
  /** Parlante: taps del transformador en W por tensión de línea ({ "70V": [8, 4, 2], "100V": [8, 4] }). */
  transformerTaps?: Evidenced<TransformerTaps>;
  /** Parlante: potencia que admite (W) — continua (RMS/AES), de programa y pico, según declare la ficha. */
  speakerPowerWatts?: Evidenced<SpeakerPower>;
  /** Parlante: sensibilidad en dB SPL (1 W / 1 m). */
  sensitivityDb?: Evidenced<number>;
  /** Parlante: ángulo de cobertura/dispersión en grados (cónico: horizontal = vertical). */
  coverageDeg?: Evidenced<Coverage>;
  /** RS-232, IP, IR, CEC, Cresnet… (cómo se controla el equipo). */
  controlProtocols?: Evidenced<string[]>;
  /** Conexiones inalámbricas que usa (protocolo y su papel). */
  wireless?: Evidenced<WirelessLink[]>;
};

export type TransformerTaps = Partial<Record<"70V" | "100V", number[]>>;
export type SpeakerPower = Partial<Record<"continuous" | "program" | "peak", number>>;
export type Coverage = { horizontal: number; vertical: number };

/** Protocolos inalámbricos del sistema AV. */
export const WIRELESS_PROTOCOLS = ["wifi", "bluetooth", "infinet", "zum-mesh", "zigbee", "zwave", "rf-mic", "dect", "airplay", "chromecast", "wireless-presentation", "ir-remote"] as const;
export type WirelessProtocol = (typeof WIRELESS_PROTOCOLS)[number];
/** client: se conecta a otro; gateway / receiver / base: recibe a los clientes; access-point: da Wi-Fi. */
export type WirelessRole = "client" | "gateway" | "receiver" | "transmitter" | "base" | "access-point";
export type WirelessLink = { protocol: WirelessProtocol; role: WirelessRole; /** Cuántos clientes admite (gateway/receptor), si la ficha lo dice. */ capacity?: number | null };

export type IoProfileData = { ports: IoPort[]; capabilities: IoCapabilities };

export const isIoSignal = (v: unknown): v is IoSignal => typeof v === "string" && (IO_SIGNALS as readonly string[]).includes(v);
export const isDirection = (v: unknown): v is IoDirection => v === "in" || v === "out" || v === "bidir";

/** Normaliza para comparar una cita con la ficha (minúsculas, sin signos ni espacios dobles). */
export function normalizeForMatch(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Mínimo de caracteres que tiene que tener una cita para valer como evidencia. */
const MIN_EVIDENCE = 6;
/** Citas largas: tramos de este largo, y la parte de ellos que tiene que estar en la ficha. */
const WINDOW = 40;
const WINDOW_SHARE = 0.6;

/**
 * ¿La cita está en la ficha? Coincidencia del texto normalizado completo o,
 * en citas largas, de un tramo de 40 caracteres (el modelo a veces recorta).
 */
export function evidenceFound(evidence: string, source: string): boolean {
  if (wholeFound(evidence, source)) return true;
  // Cita armada con celdas de una tabla ("Analog Inputs: Ch 1 - 4: RCA"): vale si está cada tramo.
  const pieces = evidence.split(/[:;|•]/).map((p) => p.trim()).filter((p) => normalizeForMatch(p).length >= MIN_EVIDENCE);
  return pieces.length >= 2 && pieces.every((p) => wholeFound(p, source));
}

function wholeFound(evidence: string, source: string): boolean {
  const e = normalizeForMatch(evidence);
  if (e.length < MIN_EVIDENCE) return false;
  if (source.includes(e)) return true;
  if (e.length <= WINDOW) return false;
  let total = 0;
  let hits = 0;
  for (let i = 0; i + WINDOW <= e.length; i += WINDOW / 2) {
    total++;
    if (source.includes(e.slice(i, i + WINDOW))) hits++;
  }
  return total > 0 && hits / total >= WINDOW_SHARE;
}
