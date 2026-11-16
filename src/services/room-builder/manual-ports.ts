/**
 * Puertos cargados a mano en un proyecto: para un equipo sin ficha (o con la
 * ficha incompleta o equivocada) el integrador declara sus conexiones
 * (nombre, señal, sentido, cantidad, conector). Quedan guardados SOLO en la
 * escena de ese proyecto (SceneDevice.manualPorts), se suman a los de la ficha
 * y el motor y el plano técnico los usan igual; en diagramas, láminas y avisos
 * van marcados como "cargado a mano, sin ficha" (no verificados).
 */

import type { CablingProfile } from "./cabling-db";
import { devicePorts, type DevicePorts } from "./device-ports";
import { IO_SIGNALS, validFamily, type IoCapabilities, type IoDirection, type IoPort, type IoSignal } from "./io-profile/types";
import type { RoomScene } from "./scene";

export type ManualPort = {
  /** Estable dentro del equipo ("m1", "m2"…). */
  id: string;
  label: string;
  signal: IoSignal;
  direction: IoDirection;
  count: number;
  connector: string | null;
  /** Enlace UTP propietario: familia con la que empareja. */
  family?: string | null;
};

/** Cita que llevan los puertos cargados a mano (no hay ficha que los respalde). */
export const MANUAL_EVIDENCE = "Cargado a mano en el proyecto (sin ficha)";
/** Texto corto para badges y leyendas. */
export const MANUAL_PORT_NOTE = "cargado a mano, sin ficha";
const MAX_PORTS = 48;
const MAX_COUNT = 64;
const DIRECTIONS: IoDirection[] = ["in", "out", "bidir"];

/** Valida lo que llega del cliente: solo señales del vocabulario, sentidos válidos y cantidades razonables. */
export function normalizeManualPorts(raw: unknown): ManualPort[] {
  if (!Array.isArray(raw)) return [];
  const out: ManualPort[] = [];
  for (const r of raw.slice(0, MAX_PORTS)) {
    if (!r || typeof r !== "object") continue;
    const o = r as Record<string, unknown>;
    const signal = o.signal as IoSignal;
    const direction = o.direction as IoDirection;
    if (!IO_SIGNALS.includes(signal) || !DIRECTIONS.includes(direction)) continue;
    const label = typeof o.label === "string" ? o.label.trim().slice(0, 60) : "";
    const count = Math.max(1, Math.min(MAX_COUNT, Math.round(Number(o.count) || 1)));
    const connector = typeof o.connector === "string" && o.connector.trim() ? o.connector.trim().slice(0, 40) : null;
    const family = typeof o.family === "string" && validFamily(o.family.trim().toLowerCase()) ? o.family.trim().toLowerCase() : null;
    const id = typeof o.id === "string" && /^[a-z0-9-]{1,20}$/i.test(o.id) ? o.id : `m${out.length + 1}`;
    out.push({ id, label: label || signal.toUpperCase(), signal, direction, count, connector, ...(signal === "cat-proprietary" && family ? { family } : {}) });
  }
  return out;
}

/** Puertos a mano como grupos de ficha (marcados `manual`), para expandir y cablear igual que los de ficha. */
export function manualIoPorts(list: ManualPort[] | null | undefined): IoPort[] {
  return (list ?? []).map((p) => ({
    signal: p.signal,
    direction: p.direction,
    count: p.count,
    connector: p.connector,
    channels: null,
    poe: null,
    label: p.label,
    evidence: MANUAL_EVIDENCE,
    manual: true,
    ...(p.family ? { family: p.family } : {}),
  }));
}

/** Suma los puertos a mano a los de la ficha (null = sin ficha: quedan solo los a mano). */
export function mergeDevicePorts(base: DevicePorts | null, manual: IoPort[]): DevicePorts | null {
  if (!manual.length) return base;
  const extra = devicePorts({ ports: manual, capabilities: {} as IoCapabilities });
  if (!extra) return base;
  if (!base) return extra;
  return { ...base, inputs: [...base.inputs, ...extra.inputs], outputs: [...base.outputs, ...extra.outputs], network: base.network + extra.network };
}

/**
 * Perfil de cableado con los puertos a mano de la escena: los usa el motor
 * (cabling.ts), el plano técnico (wiring/model.ts) y la lista de cables.
 */
export function withManualPorts(profile: CablingProfile, scene: Pick<RoomScene, "devices">): CablingProfile {
  const byId = new Map(scene.devices.map((d) => [d.id, d]));
  const touched = Object.entries(profile.devices).filter(([id, p]) => p.sheet || byId.get(id)?.manualPorts?.length);
  if (!touched.length) return profile;
  const devices = { ...profile.devices };
  for (const [id, current] of touched) {
    // Idempotente: siempre se parte de lo de la ficha (el perfil puede venir ya mezclado del servidor).
    const sheet = current.sheet ?? { ports: current.ports, ioPorts: current.ioPorts ?? null };
    const manual = manualIoPorts(byId.get(id)?.manualPorts);
    const { sheet: _old, manualPorts: _n, ...rest } = current;
    devices[id] = manual.length
      ? { ...rest, ports: mergeDevicePorts(sheet.ports, manual), ioPorts: [...(sheet.ioPorts ?? []), ...manual], manualPorts: manual.length, sheet }
      : { ...rest, ports: sheet.ports, ioPorts: sheet.ioPorts };
  }
  return { ...profile, devices };
}

/** ¿Algún puerto del grupo se cargó a mano? */
export const isManualGroup = (g: { manual?: boolean }) => Boolean(g.manual);
