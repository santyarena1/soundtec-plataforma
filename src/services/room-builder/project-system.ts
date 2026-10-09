/**
 * Sistema del proyecto (varios ambientes): qué se resuelve en un equipamiento
 * central compartido y qué queda en cada ambiente, sumando lo de todos.
 *
 * - Audio: cada ambiente aporta sus zonas y parlantes; los canales no se
 *   comparten entre ambientes, así que el total es la suma de lo que necesita
 *   cada uno (× unidades si el ambiente se repite).
 * - Control: Crestron Home lleva un único procesador para toda la obra;
 *   Crestron programado puede ir central o uno por sala.
 * - Streaming y red: fuentes para las zonas que lo pidieron y puertos para
 *   todo lo que se integra por red.
 *
 * Es una función pura; la búsqueda de productos vive en project-system-db.ts.
 */

import type { BriefControl } from "./brief";
import { channelsNeeded, type SystemSpec } from "./system-specs";

/** Cómo se arma el equipamiento común. */
export type SystemMode = "central" | "per-room";
/** Dónde va lo central (no siempre es un rack). */
export type SystemLocation = "rack" | "closet" | "hidden" | "furniture";

export const SYSTEM_MODES: SystemMode[] = ["central", "per-room"];
export const SYSTEM_LOCATIONS: SystemLocation[] = ["rack", "closet", "hidden", "furniture"];

export const SYSTEM_MODE_LABELS: Record<SystemMode, string> = {
  central: "Equipamiento central para todo el proyecto",
  "per-room": "Cada ambiente con su propio equipamiento",
};

export const SYSTEM_LOCATION_LABELS: Record<SystemLocation, string> = {
  rack: "Rack en sala técnica",
  closet: "Armario o placard técnico",
  hidden: "Escondido (cielorraso, detrás de la TV, bajo mesada)",
  furniture: "En un mueble",
};

export type ProjectSystem = {
  version: 1;
  mode: SystemMode;
  location: SystemLocation;
  control: BriefControl;
  /** Ambientes que van por su cuenta aunque el modo sea central (ids de ambiente). */
  ownRooms: string[];
};

/** Recomendación según el tipo de obra: casas y hoteles centralizan; salas de reunión van solas. */
export function defaultProjectSystem(kind: string, control: BriefControl): ProjectSystem {
  const perRoom = kind === "corporativo" || kind === "educacion";
  return {
    version: 1,
    mode: perRoom && control !== "crestron-home" ? "per-room" : "central",
    location: kind === "residencial" || kind === "hoteleria" ? "closet" : "rack",
    control,
    ownRooms: [],
  };
}

/** Normaliza lo que viene guardado o del cliente. */
export function normalizeProjectSystem(raw: unknown, fallback: ProjectSystem): ProjectSystem {
  if (!raw || typeof raw !== "object") return fallback;
  const r = raw as Record<string, unknown>;
  const mode = SYSTEM_MODES.includes(r.mode as SystemMode) ? (r.mode as SystemMode) : fallback.mode;
  const location = SYSTEM_LOCATIONS.includes(r.location as SystemLocation) ? (r.location as SystemLocation) : fallback.location;
  const control = r.control === "crestron-home" || r.control === "crestron-pro" || r.control === "none" ? (r.control as BriefControl) : fallback.control;
  const ownRooms = Array.isArray(r.ownRooms) ? r.ownRooms.filter((x): x is string => typeof x === "string").slice(0, 200) : [];
  return { version: 1, mode, location, control, ownRooms };
}

/** Qué resuelve el equipamiento central para un ambiente. */
export type Centralized = { audio: boolean; control: boolean };

export function centralizedFor(system: ProjectSystem, roomId: string | null): Centralized {
  const own = roomId != null && system.ownRooms.includes(roomId);
  const audio = system.mode === "central" && !own;
  // Crestron Home: un solo procesador por obra, siempre central.
  const control = system.control === "crestron-home" ? true : system.control === "crestron-pro" ? audio : false;
  return { audio, control };
}

/** Lo que aporta cada ambiente al sistema. */
export type RoomLoad = {
  id: string;
  name: string;
  unitCount: number;
  speakers: number;
  zones: number;
  speakerSpec: Pick<SystemSpec, "nominalOhms" | "highImpedance" | "wattsPerChannel"> | null;
  streaming: boolean;
  /** Paneles y teclados (se alimentan por PoE y van a red). */
  touchPoints: number;
  /** Otros equipos que se integran por red (pantallas, cámaras, codecs). */
  networked: number;
  centralized: Centralized;
};

/** Equipo central ya elegido. */
export type CentralDevice = { slotKey: string; quantity: number; spec: SystemSpec | null; label: string };

export type CentralRequirement =
  | { kind: "amplifier"; slotKey: string; minChannels: number; networked: boolean; highImpedance: boolean }
  | { kind: "processor"; slotKey: string; platform: "crestron-home" | "crestron-pro" }
  | { kind: "streamer"; slotKey: string; sources: number }
  | { kind: "switch"; slotKey: string; ports: number };

export type SystemTotals = {
  rooms: number;
  centralRooms: number;
  speakers: number;
  zones: number;
  channels: number;
  streamingZones: number;
  touchPoints: number;
  networkPorts: number;
};

export type ProjectFinding = {
  id: string;
  level: "ok" | "info" | "warn" | "error";
  title: string;
  detail: string;
  requirement?: CentralRequirement;
};

export const CENTRAL_SLOTS = {
  amplifier: "central_amp",
  processor: "central_processor",
  streamer: "central_streamer",
  switch: "central_switch",
} as const;

/** Un streamer resuelve hasta esta cantidad de zonas a la vez (fuentes independientes). */
const ZONES_PER_STREAMER = 4;
/** Puertos de reserva en el switch (router, notebook del integrador, crecimiento). */
const SPARE_PORTS = 4;

/** Canales que necesita un ambiente (una unidad). */
export function roomChannels(room: RoomLoad, ampMinOhms: number | null): number {
  if (room.speakers <= 0) return 0;
  if (room.speakerSpec?.highImpedance) return Math.max(1, room.zones);
  return channelsNeeded(room.speakers, room.zones, { minOhms: ampMinOhms }, room.speakerSpec?.nominalOhms ?? null);
}

/** Suma de todo lo que va al equipamiento central. */
export function projectTotals(rooms: RoomLoad[], ampMinOhms: number | null = 4): SystemTotals {
  const central = rooms.filter((r) => r.centralized.audio);
  const mult = (r: RoomLoad) => Math.max(1, r.unitCount);
  const sum = (list: RoomLoad[], f: (r: RoomLoad) => number) => list.reduce((n, r) => n + f(r) * mult(r), 0);
  const touchPoints = sum(rooms.filter((r) => r.centralized.control), (r) => r.touchPoints);
  const networked = sum(rooms.filter((r) => r.centralized.control), (r) => r.networked);
  return {
    rooms: rooms.length,
    centralRooms: central.length,
    speakers: sum(central, (r) => r.speakers),
    zones: sum(central, (r) => (r.speakers > 0 ? Math.max(1, r.zones) : 0)),
    channels: sum(central, (r) => roomChannels(r, ampMinOhms)),
    streamingZones: sum(central, (r) => (r.streaming && r.speakers > 0 ? Math.max(1, r.zones) : 0)),
    touchPoints,
    networkPorts: touchPoints + networked,
  };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Revisión del equipamiento central contra lo que suman los ambientes. */
export function checkProjectSystem(system: ProjectSystem, rooms: RoomLoad[], central: CentralDevice[]): { totals: SystemTotals; findings: ProjectFinding[] } {
  const amps = central.filter((d) => d.spec?.kind === "amplifier");
  const ampMinOhms = amps.find((a) => a.spec?.minOhms != null)?.spec?.minOhms ?? 4;
  const totals = projectTotals(rooms, ampMinOhms);
  const findings: ProjectFinding[] = [];
  const networkedControl = system.control !== "none";

  if (system.mode === "per-room" && system.control !== "crestron-home") {
    findings.push({
      id: "mode-per-room",
      level: "info",
      title: "Cada ambiente con su equipamiento",
      detail: "Amplificación y control se resuelven en cada ambiente (ver el chequeo de sistema de cada uno).",
    });
  }

  // Audio central.
  if (totals.channels > 0) {
    const available = amps.reduce((n, a) => n + (a.spec?.channels ?? 0) * Math.max(1, a.quantity), 0);
    const unknown = amps.filter((a) => a.spec?.channels == null);
    const highZ = rooms.some((r) => r.centralized.audio && r.speakerSpec?.highImpedance);
    const requirement: CentralRequirement = {
      kind: "amplifier",
      slotKey: CENTRAL_SLOTS.amplifier,
      minChannels: totals.channels,
      networked: networkedControl,
      highImpedance: highZ,
    };
    if (!amps.length) {
      findings.push({
        id: "central-amp-missing",
        level: "error",
        title: "Falta la amplificación central",
        detail: `${plural(totals.speakers, "parlante", "parlantes")} en ${plural(totals.zones, "zona", "zonas")} de ${plural(totals.centralRooms, "ambiente", "ambientes")} necesitan ${plural(totals.channels, "canal", "canales")} en total.`,
        requirement,
      });
    } else if (unknown.length) {
      findings.push({
        id: "central-amp-spec",
        level: "warn",
        title: "Faltan los canales del amplificador central",
        detail: "Cargalos en Reglas del Room Builder → Especificaciones para poder sumar.",
      });
    } else if (available < totals.channels) {
      findings.push({
        id: "central-amp-short",
        level: "error",
        title: `Faltan ${plural(totals.channels - available, "canal", "canales")} de amplificación`,
        detail: `Los ambientes suman ${totals.channels} canales y el equipamiento central da ${available}.`,
        requirement,
      });
    } else {
      findings.push({
        id: "central-amp-ok",
        level: "ok",
        title: "Amplificación central suficiente",
        detail: `${available} canales para ${totals.channels} necesarios (${plural(totals.zones, "zona", "zonas")}, ${plural(totals.speakers, "parlante", "parlantes")}).`,
      });
    }
    const ampHighZ = amps.some((a) => a.spec?.highImpedance);
    if (amps.length && highZ !== ampHighZ) {
      findings.push({
        id: "central-amp-line",
        level: "error",
        title: "Línea de 70/100 V incompatible",
        detail: highZ ? "Hay ambientes con parlantes de línea de 70/100 V y el amplificador central es de baja impedancia." : "El amplificador central es de línea y los parlantes son de baja impedancia.",
      });
    }
  }

  // Control central.
  const controlRooms = rooms.filter((r) => r.centralized.control);
  if (networkedControl && controlRooms.length) {
    const processors = central.filter((d) => d.slotKey === CENTRAL_SLOTS.processor || d.spec?.kind === "processor");
    const platform = system.control as "crestron-home" | "crestron-pro";
    if (!processors.length) {
      findings.push({
        id: "central-processor-missing",
        level: "error",
        title: platform === "crestron-home" ? "Falta el procesador Crestron Home" : "Falta el procesador de control",
        detail:
          platform === "crestron-home"
            ? `Crestron Home usa un único procesador para toda la obra: controla los ${plural(controlRooms.length, "ambiente", "ambientes")} y sus ${plural(totals.touchPoints, "panel o teclado", "paneles y teclados")}.`
            : `Un procesador central para ${plural(controlRooms.length, "ambiente", "ambientes")}.`,
        requirement: { kind: "processor", slotKey: CENTRAL_SLOTS.processor, platform },
      });
    } else if (platform === "crestron-home" && processors.reduce((n, p) => n + p.quantity, 0) > 1) {
      findings.push({
        id: "central-processor-many",
        level: "warn",
        title: "Más de un procesador Crestron Home",
        detail: "Una obra Crestron Home lleva un solo procesador (salvo obras muy grandes con más de uno por diseño).",
      });
    } else {
      findings.push({ id: "central-processor-ok", level: "ok", title: "Procesador central", detail: `Controla ${plural(controlRooms.length, "ambiente", "ambientes")}.` });
    }
  }

  // Streaming.
  if (totals.streamingZones > 0) {
    const sources = central.filter((d) => d.spec?.streaming).reduce((n, d) => n + Math.max(1, d.quantity), 0);
    const needed = Math.ceil(totals.streamingZones / ZONES_PER_STREAMER);
    if (sources < needed) {
      findings.push({
        id: "central-streaming",
        level: "warn",
        title: "Fuentes de streaming",
        detail: `${plural(totals.streamingZones, "zona pide", "zonas piden")} música por red: con ${plural(needed, "reproductor", "reproductores")} pueden sonar cosas distintas a la vez${sources ? ` (hay ${sources})` : ""}.`,
        requirement: { kind: "streamer", slotKey: CENTRAL_SLOTS.streamer, sources: needed - sources },
      });
    }
  }

  // Red.
  const ports = totals.networkPorts + (amps.some((a) => a.spec?.networked) ? amps.length : 0) + (networkedControl ? 1 : 0);
  if (networkedControl && ports > 0 && !central.some((d) => d.spec?.kind === "switch")) {
    findings.push({
      id: "central-switch",
      level: "info",
      title: "Red del sistema",
      detail: `Unos ${ports + SPARE_PORTS} puertos (PoE para paneles y teclados) si la obra no tiene una red dedicada.`,
      requirement: { kind: "switch", slotKey: CENTRAL_SLOTS.switch, ports: ports + SPARE_PORTS },
    });
  }

  const order = { error: 0, warn: 1, info: 2, ok: 3 } as const;
  return { totals, findings: findings.sort((a, b) => order[a.level] - order[b.level]) };
}

/** Cantidad de unidades de un amplificador de `channels` canales para cubrir `needed`. */
export function unitsFor(needed: number, channels: number): number {
  return channels > 0 ? Math.max(1, Math.ceil(needed / channels)) : 1;
}
