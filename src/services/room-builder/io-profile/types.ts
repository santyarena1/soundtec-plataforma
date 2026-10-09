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
};

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
  /** RS-232, IP, IR, CEC, Cresnet… (cómo se controla el equipo). */
  controlProtocols?: Evidenced<string[]>;
  /** Conexiones inalámbricas que usa (protocolo y su papel). */
  wireless?: Evidenced<WirelessLink[]>;
};

/** Protocolos inalámbricos del sistema AV. */
export const WIRELESS_PROTOCOLS = ["wifi", "bluetooth", "infinet", "zigbee", "zwave", "rf-mic", "dect", "airplay", "chromecast", "wireless-presentation", "ir-remote"] as const;
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
