/**
 * Plano técnico: el cableado real de la sala, guardado en el proyecto y
 * editable a mano. Cada cable va de un puerto concreto de un equipo a un
 * puerto concreto de otro, con su recorrido en planta (quiebres), su tipo, el
 * cable del catálogo, su etiqueta y su largo.
 */

import type { IoDirection, IoSignal } from "../io-profile/types";

/** Un puerto físico de un equipo ("HDMI IN 2", "COM 1", "Canal 3"). */
export type WirePort = {
  /** Estable dentro del equipo: "in:hdmi:2". */
  id: string;
  signal: IoSignal;
  direction: IoDirection;
  /** Rótulo como en la ficha (o el que le puso el usuario). */
  label: string;
  connector: string | null;
  /** De dónde sale: ficha del fabricante, equipo genérico o carga manual. */
  source: "datasheet" | "generic" | "manual";
  /** Enlace UTP propietario: familia con la que empareja ("hall-ultra-4k"). */
  family?: string | null;
  /** Largo máximo del enlace según la ficha (m). */
  maxLengthM?: number | null;
  /** Cita de la ficha (sirve para reconocer el nivel de audio: "Mic/Line"). */
  evidence?: string | null;
};

/** Punta de un cable: equipo, unidad (si hay varias) y puerto. */
export type WireEnd = { deviceId: string; unit: number; portId: string };

/** Quiebre del recorrido en planta (m, coordenadas de la sala). */
export type WirePoint = { x: number; z: number };

export type Wire = {
  id: string;
  from: WireEnd;
  to: WireEnd;
  signal: IoSignal;
  /** Cable del catálogo elegido para este tramo. */
  cableProductId: string | null;
  /** Etiqueta de obra (ej. "SALA-HDMI-001"). */
  label: string | null;
  /** Quiebres del recorrido en planta, sin las puntas. */
  points: WirePoint[];
  /** Largo forzado a mano (m); si no, sale del recorrido. */
  lengthOverrideM: number | null;
  /** auto: lo propuso el sistema (se puede rehacer); manual: lo tocó el usuario (queda fijo). */
  origin: "auto" | "manual";
};

/**
 * Punta de cable que no es un producto de la sala: la conexión de mesa (caja
 * de piso para la notebook), el switch que falta sumar o el rack central (si
 * el ambiente baja al rack del proyecto). Se dibuja con su posición.
 */
export type VirtualEnd = {
  /** "table" | "switch-new" | "central" | "rx-new-N" (ids del motor automático). */
  id: string;
  label: string;
  /** extender: receptor HDBaseT a sumar detrás de una pantalla. */
  kind: "table" | "switch" | "rack" | "extender";
  x: number;
  y: number;
  z: number;
  mount: string;
};

/** Ids de las puntas virtuales que propone el motor automático. */
export const VIRTUAL_END_IDS = ["table", "switch-new", "central"] as const;

export type SceneWiring = {
  version: 1;
  wires: Wire[];
  /** Puertos cargados a mano (equipos genéricos o sin ficha), por id de equipo. */
  ports: Record<string, WirePort[]>;
  /** Puntas virtuales usadas por los cables (mesa, switch a sumar, rack central), por id. */
  virtual?: Record<string, VirtualEnd>;
  /**
   * Cables que el usuario borró a mano ("equipoA|equipoB|familia", uno por
   * cable): el armado automático no los vuelve a proponer ni la cotización los suma.
   */
  dismissed?: string[];
  /** Posiciones de los bloques en el diagrama de señal movidos a mano ("deviceId#unidad"). */
  diagram?: Record<string, { x: number; y: number }>;
};

export const EMPTY_WIRING: SceneWiring = { version: 1, wires: [], ports: {} };

/** Color y nombre de cada señal en el plano técnico y el diagrama. */
export const WIRE_SIGNAL_STYLE: Record<IoSignal, { label: string; color: string }> = {
  hdmi: { label: "HDMI", color: "#e11d48" },
  displayport: { label: "DisplayPort", color: "#db2777" },
  "usb-a": { label: "USB", color: "#78716c" },
  "usb-b": { label: "USB", color: "#78716c" },
  "usb-c": { label: "USB-C", color: "#f97316" },
  hdbaset: { label: "HDBaseT", color: "#9333ea" },
  sdi: { label: "SDI", color: "#64748b" },
  vga: { label: "VGA / PC analógico", color: "#4f46e5" },
  lan: { label: "Red / LAN", color: "#2563eb" },
  dante: { label: "Dante / audio en red", color: "#0d9488" },
  "analog-audio": { label: "Audio analógico", color: "#16a34a" },
  mic: { label: "Micrófono", color: "#22c55e" },
  speaker: { label: "Parlante", color: "#57534e" },
  "digital-audio": { label: "Audio digital S/PDIF", color: "#ca8a04" },
  rs232: { label: "Control RS-232", color: "#06b6d4" },
  rs485: { label: "RS-485", color: "#0891b2" },
  ir: { label: "IR", color: "#67e8f9" },
  relay: { label: "Contacto seco / relé", color: "#9ca3af" },
  gpio: { label: "E/S digital", color: "#6b7280" },
  cresnet: { label: "Cresnet", color: "#1d4ed8" },
  fiber: { label: "Fibra óptica", color: "#c026d3" },
  wireless: { label: "Inalámbrico", color: "#a855f7" },
  "cat-proprietary": { label: "Enlace UTP propietario", color: "#0e7490" },
};
