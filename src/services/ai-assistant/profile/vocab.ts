/**
 * Vocabulario canónico del perfil de producto.
 *
 * Es el contrato entre tres piezas: el extractor (que lo llena una vez por
 * producto), el analizador de preguntas (que traduce "parlante de exterior"
 * a un filtro) y el retrieval (que consulta columnas en vez de texto).
 * Si un valor no está acá, no existe para el asistente.
 */

export const PRODUCT_TYPES = [
  "speaker",
  "subwoofer",
  "amplifier",
  "processor",
  "control",
  "touchpanel",
  "display",
  "switcher",
  "camera",
  "microphone",
  "mount",
  "cable",
  "lighting",
  "power",
  "network",
  "accessory",
  "other",
] as const;
export type ProductType = (typeof PRODUCT_TYPES)[number];

export const ENVIRONMENTS = ["INDOOR", "OUTDOOR", "BOTH", "UNKNOWN"] as const;
export type Environment = (typeof ENVIRONMENTS)[number];

export const MOUNT_TYPES = [
  "in-ceiling",
  "in-wall",
  "on-wall",
  "surface",
  "pendant",
  "rack",
  "landscape",
  "pole",
  "desktop",
  "portable",
  "flush",
] as const;
export type MountType = (typeof MOUNT_TYPES)[number];

export const AUDIO_LINES = ["LOW_Z", "70V", "100V", "BOTH"] as const;
export type AudioLine = (typeof AUDIO_LINES)[number];

export const ECOSYSTEMS = [
  "crestron-home",
  "control4",
  "savant",
  "sonos",
  "dante",
  "aes67",
  "airplay",
  "poe",
  "bluetooth",
  "wifi",
  "hdmi",
  "usb-c",
  "avb",
] as const;
export type Ecosystem = (typeof ECOSYSTEMS)[number];

export const APPLICATIONS = [
  "residencial",
  "restaurante",
  "hotel",
  "oficina",
  "retail",
  "auditorio",
  "gimnasio",
  "educacion",
  "salud",
  "culto",
  "exterior",
  "streaming",
  "industrial",
] as const;
export type Application = (typeof APPLICATIONS)[number];

/** Etiquetas en español para armar respuestas sin pasar por el modelo. */
export const PRODUCT_TYPE_LABEL: Record<ProductType, string> = {
  speaker: "parlante",
  subwoofer: "subwoofer",
  amplifier: "amplificador",
  processor: "procesador",
  control: "control",
  touchpanel: "panel táctil",
  display: "pantalla",
  switcher: "switcher",
  camera: "cámara",
  microphone: "micrófono",
  mount: "soporte",
  cable: "cable",
  lighting: "iluminación",
  power: "alimentación",
  network: "red",
  accessory: "accesorio",
  other: "producto",
};

export const PRODUCT_TYPE_LABEL_PLURAL: Record<ProductType, string> = {
  speaker: "parlantes",
  subwoofer: "subwoofers",
  amplifier: "amplificadores",
  processor: "procesadores",
  control: "controles",
  touchpanel: "paneles táctiles",
  display: "pantallas",
  switcher: "switchers",
  camera: "cámaras",
  microphone: "micrófonos",
  mount: "soportes",
  cable: "cables",
  lighting: "productos de iluminación",
  power: "productos de alimentación",
  network: "productos de red",
  accessory: "accesorios",
  other: "productos",
};

export const MOUNT_LABEL: Record<MountType, string> = {
  "in-ceiling": "de embutir en techo",
  "in-wall": "de embutir en pared",
  "on-wall": "de superficie en pared",
  surface: "de superficie",
  pendant: "colgante",
  rack: "de rack",
  landscape: "de jardín",
  pole: "de poste",
  desktop: "de escritorio",
  portable: "portátil",
  flush: "enrasado",
};

export const ECOSYSTEM_LABEL: Record<Ecosystem, string> = {
  "crestron-home": "Crestron Home",
  control4: "Control4",
  savant: "Savant",
  sonos: "Sonos",
  dante: "Dante",
  aes67: "AES67",
  airplay: "AirPlay",
  poe: "PoE",
  bluetooth: "Bluetooth",
  wifi: "Wi-Fi",
  hdmi: "HDMI",
  "usb-c": "USB-C",
  avb: "AVB",
};

export const APPLICATION_LABEL: Record<Application, string> = {
  residencial: "residencial",
  restaurante: "restaurante o bar",
  hotel: "hotelería",
  oficina: "oficina y salas de reunión",
  retail: "comercio",
  auditorio: "auditorio o salón",
  gimnasio: "gimnasio",
  educacion: "educación",
  salud: "salud",
  culto: "templo o iglesia",
  exterior: "exterior",
  streaming: "videoconferencia o streaming",
  industrial: "industrial",
};

export function isProductType(value: unknown): value is ProductType {
  return typeof value === "string" && (PRODUCT_TYPES as readonly string[]).includes(value);
}

export function isEnvironment(value: unknown): value is Environment {
  return typeof value === "string" && (ENVIRONMENTS as readonly string[]).includes(value);
}

export function isAudioLine(value: unknown): value is AudioLine {
  return typeof value === "string" && (AUDIO_LINES as readonly string[]).includes(value);
}

/** Filtra una lista cualquiera dejando solo los valores del vocabulario. */
export function keepKnown<T extends string>(
  values: unknown,
  vocabulary: readonly T[],
  max: number
): T[] {
  if (!Array.isArray(values)) return [];
  const allowed = new Set<string>(vocabulary);
  const out: T[] = [];
  for (const raw of values) {
    const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
    if (!allowed.has(value) || out.includes(value as T)) continue;
    out.push(value as T);
    if (out.length >= max) break;
  }
  return out;
}
