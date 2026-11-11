/**
 * Datos de las láminas técnicas, independientes de dónde salió el cableado
 * (manual del plano técnico o propuesta automática): equipos numerados,
 * cables con etiqueta y largo (medido en plano, fijado a mano o estimado),
 * totales por tipo de cable, etiquetas para imprimir y las diferencias entre
 * el armado automático y el cableado manual. Lógica pura, sin base.
 */

/**
 * Cómo se obtuvo el largo de un cable:
 * plan = recorrido dibujado en el plano de la sala;
 * fixed = largo cargado a mano;
 * estimated = cálculo del motor automático o tramo que sale de la sala (al rack central).
 */
export type LengthKind = "plan" | "fixed" | "estimated";

export const LENGTH_KIND_LABEL: Record<LengthKind, string> = {
  plan: "Medido en plano",
  fixed: "Fijado a mano",
  estimated: "Estimado",
};

/** Origen de los puertos de un equipo, como lo lee un integrador. */
export type PortsSource = "ficha" | "pendiente" | "generico";

export const PORTS_SOURCE_LABEL: Record<PortsSource, string> = {
  ficha: "Ficha del fabricante",
  pendiente: "Pendiente",
  generico: "Genérico",
};

export type SheetPoint = { x: number; z: number };

export type SheetDevice = {
  /** Número en el plano y en la lista (0 = sin número: punto virtual del cableado). */
  n: number;
  deviceId: string;
  brand: string;
  model: string;
  role: string;
  quantity: number;
  location: string;
  ports: PortsSource;
  /** Aclaración del origen de los puertos ("puertos cargados a mano", "ficha a revisar"…). */
  portsNote: string | null;
  /** Lugar de cada unidad en la planta (m). */
  units: SheetPoint[];
  /** Fuera de la sala (rack central). */
  remote: boolean;
  imageUrl?: string | null;
  productId?: string | null;
};

export type SheetCable = {
  tag: string;
  fromDevice: string;
  fromPort: string;
  toDevice: string;
  toPort: string;
  /** Nombre de la señal y su color en el plano. */
  signal: string;
  color: string;
  /** Cable del catálogo elegido (null: a definir). */
  cable: string | null;
  lengthM: number;
  lengthKind: LengthKind;
  /** Recorrido en planta (m), con las puntas. */
  points: SheetPoint[];
  note?: string | null;
  /** Ambiente (solo en el juego del proyecto completo). */
  room?: string;
};

export type SheetWarning = { level: "error" | "warn" | "info"; text: string };

export type CableTotal = { cable: string; signal: string; color: string; count: number; meters: number; estimated: boolean };

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Etiqueta de obra de un cable sin etiqueta: C-01, C-02… (con prefijo del ambiente si corresponde). */
export function cableTag(index: number, prefix?: string | null): string {
  const tag = `C-${String(index + 1).padStart(2, "0")}`;
  return prefix ? `${prefix}-${tag}` : tag;
}

/** Totales por tipo de cable (producto elegido o, si falta, la señal), de mayor a menor metraje. */
export function cableTotals(cables: SheetCable[]): CableTotal[] {
  const map = new Map<string, CableTotal>();
  for (const c of cables) {
    const key = c.cable ? `p:${c.cable}` : `s:${c.signal}`;
    const row = map.get(key) ?? { cable: c.cable ?? `${c.signal} (cable a definir)`, signal: c.signal, color: c.color, count: 0, meters: 0, estimated: false };
    row.count++;
    row.meters = round1(row.meters + c.lengthM);
    row.estimated = row.estimated || c.lengthKind === "estimated";
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.meters - a.meters);
}

/** Largo total de cable (m). */
export function totalLength(cables: SheetCable[]): number {
  return round1(cables.reduce((a, c) => a + c.lengthM, 0));
}

export type CableLabel = { tag: string; end: "A" | "B"; here: string; herePort: string; there: string; therePort: string; signal: string; color: string };

/** Etiquetas para imprimir: dos por cable, una en cada punta (dice dónde está y a dónde va). */
export function cableLabels(cables: SheetCable[]): CableLabel[] {
  return cables.flatMap((c) => [
    { tag: c.tag, end: "A" as const, here: c.fromDevice, herePort: c.fromPort, there: c.toDevice, therePort: c.toPort, signal: c.signal, color: c.color },
    { tag: c.tag, end: "B" as const, here: c.toDevice, herePort: c.toPort, there: c.fromDevice, therePort: c.fromPort, signal: c.signal, color: c.color },
  ]);
}

/** Un enlace para comparar: equipos de las puntas (sin unidad) y familia de señal física. */
export type LinkKey = { a: string; b: string; family: string };

/**
 * Cables del armado automático que no están en el cableado manual: se cuenta
 * por par de equipos y familia de señal (el orden de las puntas no importa).
 * Devuelve los índices de los enlaces automáticos sobrantes.
 */
export function autoNotInManual(auto: LinkKey[], manual: LinkKey[]): number[] {
  const key = (l: LinkKey) => `${[l.a, l.b].sort().join("|")}|${l.family}`;
  const available = new Map<string, number>();
  for (const m of manual) available.set(key(m), (available.get(key(m)) ?? 0) + 1);
  const missing: number[] = [];
  auto.forEach((l, i) => {
    const k = key(l);
    const left = available.get(k) ?? 0;
    if (left > 0) available.set(k, left - 1);
    else missing.push(i);
  });
  return missing;
}

/** Familia física de una señal de ficha (IoSignal) o del motor automático, para comparar los dos cableados. */
export function physicalFamily(signal: string): string {
  if (signal === "usb" || signal.startsWith("usb-")) return "usb";
  if (signal === "lan" || signal === "dante") return "net";
  if (signal === "line" || signal === "analog-audio" || signal === "mic" || signal === "digital-audio") return "audio";
  return signal;
}

/** Equipo de una punta del motor: "dev#2" → "dev"; los puntos virtuales ("table", "central") quedan igual. */
export const nodeDevice = (nodeId: string) => nodeId.replace(/#\d+$/, "");
