/**
 * Cableado de una sala con los puertos REALES de cada equipo (ficha del
 * fabricante): qué cable va de qué equipo a cuál, por dónde pasa (subida por
 * pared, cielorraso, bajada) y cuántos metros lleva. Valida señal, puertos
 * libres, largos, PoE, canales Dante y línea de parlantes. Un equipo sin ficha
 * leída no se cablea con suposiciones: queda marcado como pendiente.
 */

import { SIGNAL_INFO, portCount, type DeviceClass, type DevicePorts, type Signal } from "./device-ports";
import { cableLengthM } from "./cable-length";
import { assignSpeakers, type AmpUnit, type ChannelLoad } from "./amp-assign";
import { ampMinLoad, HIGHZ_MAX_LOAD_RATIO, speakerGauge, TYPICAL_MIN_LOAD_OHMS } from "./amp-load";
import { audioPair, audioProblem, feedAudio, feedDisplays, hasAudioOut, lengthFindings, proprietaryLinks, type AddLink, type LinkCtx, type Ready } from "./cabling-links";
import type { ReachCatalog } from "./signal-reach";

export type Point3 = [number, number, number];

export type CableNode = {
  id: string;
  label: string;
  cls: DeviceClass;
  /** null: el producto no tiene su ficha leída todavía. */
  ports: DevicePorts | null;
  pos: { x: number; y: number; z: number };
  mount: string;
  /** Producto del catálogo (para leer su ficha si falta). */
  productId?: string | null;
  /** Punto que no es un producto de la sala (rack central, conexión de mesa, switch a definir). */
  virtual?: boolean;
  /** Amplificador compartido: números reales de los canales que puede usar esta sala. */
  channelMap?: number[];
};

export type CableLink = {
  id: string;
  from: string;
  to: string;
  signal: Signal;
  fromPort: string;
  toPort: string;
  route: Point3[];
  /** Recorrido medido (m). */
  runM: number;
  /** Cable a comprar (m): con rulos de servicio y, en cables armados, el largo estándar. */
  cableM: number;
  note?: string;
  /** Enlace inalámbrico: protocolo (sin cable ni metros). */
  protocol?: string;
};

/** Solución que el sistema puede aplicar solo: sumar un equipo genérico (que después se cablea solo). */
export type FindingFix = { generic: string; label: string; /** Junto a qué equipo conviene ubicarlo (m). */ near?: { x: number; z: number } };
export type CableFinding = { id: string; level: "info" | "warn" | "error"; title: string; detail: string; linkId?: string; productIds?: string[]; fix?: FindingFix };

export type CablingInput = {
  nodes: CableNode[];
  dims: { widthM: number; depthM: number; heightM: number };
  /** Conexión de mesa para la notebook (caja de piso / mesa), si la sala tiene mesa de reunión. */
  tableInput?: { x: number; z: number; topY: number } | null;
  /** Equipamiento central fuera de la sala (sala técnica / rack del proyecto). */
  central?: { label: string; exit: { x: number; z: number } } | null;
  /** Amplificación: tipo de sala (tap por defecto en 70/100 V) y tap fijado por el usuario (W). */
  audio?: AudioOptions;
  /**
   * Sala sin sistema de control ni videoconferencia: la red de un amplificador o un DSP es
   * solo de configuración y no obliga a sumar un switch. Si algún equipo la necesita para
   * funcionar (PoE, Dante, códec, panel, streaming), se cablea todo como siempre.
   */
  networkOptional?: boolean;
  /** Productos del catálogo que resuelven tramos largos (AOC, USB activo, extensor/receptor HDBaseT), para nombrarlos en los avisos. */
  remedies?: ReachCatalog;
};

export type AudioOptions = { category?: string | null; tapW?: number | null };

export type CablingPlan = {
  nodes: CableNode[];
  links: CableLink[];
  findings: CableFinding[];
  totals: Array<{ signal: Signal; count: number; meters: number }>;
  /** Equipos que no se pudieron cablear por falta de ficha. */
  missing: CableNode[];
  /** Carga de cada canal de amplificación usado (impedancia, taps, potencia). */
  amplification?: ChannelLoad[];
};

/** Señales que se arman con cable de rollo (se compra por metro). */
const BULK: Signal[] = ["lan", "dante", "hdbaset", "speaker", "line", "digital", "cat", "rs232", "ir"];
/**
 * Equipos de pared o rack a menos de esto en planta (ej. el receptor o el códec detrás de la
 * pantalla, dos equipos del mismo rack): el cable va directo por detrás, no por el cielorraso (m).
 * Misma regla que el plano técnico (wiring/validate.ts).
 */
export const DIRECT_RUN_M = 1.5;
const DIRECT_MOUNTS = new Set(["wall", "rack"]);

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Recorrido de un cable: sube (o baja por el piso hasta la pared y sube), cruza por el cielorraso y baja. */
export function routeCable(a: CableNode, b: CableNode, dims: CablingInput["dims"]): Point3[] {
  if (DIRECT_MOUNTS.has(a.mount) && DIRECT_MOUNTS.has(b.mount) && Math.hypot(a.pos.x - b.pos.x, a.pos.z - b.pos.z) < DIRECT_RUN_M) {
    // Tramo corto por detrás del equipo, a escuadra: vertical en la punta de origen y luego en planta.
    const end: Point3 = [b.pos.x, b.pos.y, b.pos.z];
    const path = dedupe([[a.pos.x, a.pos.y, a.pos.z], [a.pos.x, b.pos.y, a.pos.z], [b.pos.x, b.pos.y, a.pos.z], end]);
    return path.length > 1 ? [...path.slice(0, -1), end] : [path[0]!, end];
  }
  const ceil = Math.max(2.2, dims.heightM - 0.03);
  const toCeiling = (n: CableNode): Point3[] => {
    const p: Point3 = [n.pos.x, n.pos.y, n.pos.z];
    if (n.mount === "ceiling") return [p, [p[0], ceil, p[2]]];
    if (n.mount === "table" || n.mount === "floor") {
      // Caja de piso: baja, va por el piso hasta la pared más cercana y sube.
      const hw = dims.widthM / 2;
      const hd = dims.depthM / 2;
      const gaps: Array<[number, Point3]> = [
        [hw - p[0], [hw, 0.02, p[2]]],
        [p[0] + hw, [-hw, 0.02, p[2]]],
        [hd - p[2], [p[0], 0.02, hd]],
        [p[2] + hd, [p[0], 0.02, -hd]],
      ];
      const wall = gaps.sort((x, y) => x[0] - y[0])[0]![1];
      return [p, [p[0], 0.02, p[2]], wall, [wall[0], ceil, wall[2]]];
    }
    return [p, [p[0], ceil, p[2]]];
  };
  const up = toCeiling(a);
  const down = toCeiling(b).reverse();
  const ta = up[up.length - 1]!;
  const tb = down[0]!;
  return dedupe([...up, [tb[0], ceil, ta[2]], ...down]);
}

function dedupe(points: Point3[]): Point3[] {
  return points.filter((p, i) => i === 0 || Math.hypot(p[0] - points[i - 1]![0], p[1] - points[i - 1]![1], p[2] - points[i - 1]![2]) > 1e-3);
}

export function routeLength(points: Point3[]): number {
  let n = 0;
  for (let i = 1; i < points.length; i++) n += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1], points[i]![2] - points[i - 1]![2]);
  return n;
}

/** Metros de cable a comprar para un recorrido: la misma fórmula que el plano técnico (cable-length.ts). */
export function cableMeters(runM: number, signal: Signal): number {
  return cableLengthM(runM, BULK.includes(signal));
}

/** Genérico que resuelve la falta de la contraparte inalámbrica de cada protocolo. */
const WIRELESS_FIX: Record<string, { generic: string; label: string }> = {
  infinet: { generic: "infinet-gateway", label: "Sumar gateway infiNET EX" },
  "zum-mesh": { generic: "zum-bridge", label: "Sumar bridge Zūm Mesh" },
  zigbee: { generic: "zigbee-gateway", label: "Sumar gateway Zigbee" },
  "rf-mic": { generic: "wireless-mic", label: "Sumar receptor de micrófono" },
};

/** Contraparte que necesita un cliente de cada protocolo (y cómo se llama). */
const WIRELESS_PEER: Record<string, { roles: string[]; name: string; required: boolean }> = {
  infinet: { roles: ["gateway"], name: "gateway infiNET EX", required: true },
  "zum-mesh": { roles: ["gateway"], name: "bridge Zūm Mesh", required: true },
  zigbee: { roles: ["gateway"], name: "gateway Zigbee", required: true },
  zwave: { roles: ["gateway"], name: "gateway Z-Wave", required: true },
  "rf-mic": { roles: ["receiver"], name: "receptor de micrófonos", required: true },
  dect: { roles: ["base", "receiver"], name: "base DECT", required: true },
  "wireless-presentation": { roles: ["base"], name: "base de presentación inalámbrica", required: true },
  wifi: { roles: ["access-point"], name: "punto de acceso Wi-Fi", required: false },
};
export const WIRELESS_LABEL: Record<string, string> = {
  infinet: "infiNET EX",
  "zum-mesh": "Zūm Mesh",
  zigbee: "Zigbee",
  zwave: "Z-Wave",
  "rf-mic": "RF",
  dect: "DECT",
  "wireless-presentation": "Presentación inalámbrica",
  wifi: "Wi-Fi",
  bluetooth: "Bluetooth",
  airplay: "AirPlay",
  chromecast: "Chromecast",
  "ir-remote": "IR",
};

/** Conexiones inalámbricas: cada cliente con su gateway / receptor / base, respetando la capacidad declarada. */
function wirelessLinks(nodes: Array<CableNode & { ports: DevicePorts }>, links: CableLink[], findings: CableFinding[]) {
  const load = new Map<string, number>();
  for (const client of nodes) {
    for (const w of client.ports.wireless ?? []) {
      if (w.role !== "client" && w.role !== "transmitter") continue;
      const peer = WIRELESS_PEER[w.protocol];
      if (!peer) continue;
      const name = WIRELESS_LABEL[w.protocol] ?? w.protocol;
      const hosts = nodes.filter((n) => n !== client && (n.ports.wireless ?? []).some((x) => x.protocol === w.protocol && peer.roles.includes(x.role)));
      if (!hosts.length) {
        findings.push(
          peer.required
            ? { id: `wl-${w.protocol}-${client.id}`, level: "error", title: `Falta ${peer.name}`, detail: `${client.label} se conecta por ${name} y no hay ${peer.name} en la sala.`, fix: WIRELESS_FIX[w.protocol] ? { ...WIRELESS_FIX[w.protocol]!, near: { x: client.pos.x, z: client.pos.z } } : undefined }
            : { id: `wl-${w.protocol}-${client.id}`, level: "info", title: `${name} del edificio`, detail: `${client.label} usa ${name}: necesita cobertura de la red inalámbrica en la sala.` },
        );
        continue;
      }
      // El de menos carga; la capacidad declarada en la ficha manda.
      const host = [...hosts].sort((a, b) => (load.get(a.id) ?? 0) - (load.get(b.id) ?? 0))[0]!;
      const cap = (host.ports.wireless ?? []).find((x) => x.protocol === w.protocol)?.capacity ?? null;
      const used = (load.get(host.id) ?? 0) + 1;
      load.set(host.id, used);
      if (cap != null && used > cap) {
        findings.push({ id: `wl-cap-${host.id}-${w.protocol}`, level: "error", title: `${peer.name} sin capacidad`, detail: `${host.label} admite ${cap} dispositivo(s) ${name} y el diseño usa ${used}.`, fix: WIRELESS_FIX[w.protocol] });
      }
      links.push({
        id: `${client.id}~${host.id}~${w.protocol}${links.length}`,
        from: client.id,
        to: host.id,
        signal: "wireless",
        fromPort: name,
        toPort: peer.name,
        route: [
          [client.pos.x, client.pos.y, client.pos.z],
          [host.pos.x, host.pos.y, host.pos.z],
        ],
        runM: 0,
        cableM: 0,
        protocol: w.protocol,
      });
    }
  }
}

/** Calibre del cable de parlante por pérdida (< 0,5 dB): ver amp-load.ts. */
export { speakerGauge } from "./amp-load";

const fmtW = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

/**
 * Parlantes pasivos a los canales de los amplificadores por carga real (amp-assign.ts), con el
 * calibre de cada tramo según la carga final de su canal y los avisos de lo que no entra o se estimó.
 */
function wireSpeakers(amps: Ready[], passive: Ready[], central: Ready | null, audio: AudioOptions, add: AddLink, findings: CableFinding[]): ChannelLoad[] {
  const units: AmpUnit[] = amps.map((a) => ({ id: a.id, label: a.label, ports: a.ports, channels: a.channelMap ?? Array.from({ length: portCount(a.ports, "outputs", "speaker") }, (_, k) => k + 1) }));
  if (!units.some((u) => u.channels.length)) {
    if (central) for (const spk of passive) add(central, spk, "speaker", "Amplificación central", "Entrada", "Tramo hasta la sala técnica aparte");
    else if (passive.length) findings.push({ id: "spk-no-amp", level: "error", title: "Parlantes pasivos sin amplificador", detail: `${passive.length} parlante(s) pasivo(s) necesitan amplificación: ${passive.map((p) => p.label).join(", ")}.`, fix: { generic: "amp-4ch", label: "Sumar amplificador de 4 canales" } });
    return [];
  }
  const res = assignSpeakers(units, passive.map((s) => ({ id: s.id, label: s.label, ports: s.ports })), audio);
  const byId = new Map([...amps, ...passive].map((n) => [n.id, n]));
  for (const p of res.placements) {
    const amp = byId.get(p.ampId)!;
    const spk = byId.get(p.speakerId)!;
    const ch = res.channels.find((c) => c.ampId === p.ampId && c.channel === p.channel)!;
    const port = p.partner != null ? `Canal ${p.channel} (puenteado ${p.channel}+${p.partner})` : `Canal ${p.channel}`;
    const l = add(amp, spk, "speaker", port, "Entrada");
    const g = speakerGauge(l.runM, ch.mode === "low" ? { mode: "low", ohms: ch.loadOhms ?? TYPICAL_MIN_LOAD_OHMS } : { mode: "high", volts: ch.volts ?? "70V", watts: ch.tapW });
    l.note = p.tapW != null ? `${g.label} · tap ${fmtW(p.tapW)} W` : g.label;
    if (!g.enough) findings.push({ id: `spk-gauge-${l.id}`, level: "warn", title: "Tramo de parlante con pérdida alta", detail: `${amp.label} → ${spk.label}: ${l.runM} m pierden ${fmtW(-g.lossDb)} dB aun con ${fmtW(g.mm2)} mm². Acercá el amplificador, partí el canal o pasá a línea de 70/100 V.`, linkId: l.id });
  }
  for (const x of res.incompatible) {
    const spk = byId.get(x.speakerId)!;
    findings.push({
      id: `line-${spk.id}`,
      level: "error",
      title: "Parlante y amplificador incompatibles",
      detail: `${spk.label} ${x.lowZ ? "es de baja impedancia (sin transformador)" : "trabaja en línea de 70/100 V"} y ningún amplificador de la sala tiene ese modo.`,
      fix: x.lowZ ? { generic: "amp-4ch", label: "Sumar amplificador de baja impedancia" } : { generic: "amp-70v", label: "Sumar amplificador 70/100 V" },
    });
  }
  const names = (ids: string[]) => ids.map((id) => byId.get(id)!.label).join(", ");
  if (res.short.low.length) {
    const mins = [...new Set(units.map((u) => ampMinLoad(u.ports, u.label).ohms))].map((o) => `${fmtW(o)} Ω`).join(" / ");
    findings.push({ id: "amp-load", level: "error", title: "Canales de amplificación insuficientes", detail: `${res.short.low.length} parlante(s) sin canal (${names(res.short.low)}): en baja impedancia la carga en paralelo de cada canal no puede bajar de ${mins}. Sumá canales de amplificación.`, fix: { generic: "amp-4ch", label: "Sumar amplificador de 4 canales" } });
  }
  if (res.short.high.length) {
    findings.push({ id: "amp-line-power", level: "error", title: "Amplificación de línea insuficiente (70/100 V)", detail: `${res.short.high.length} parlante(s) no entran (${names(res.short.high)}): la suma de taps pasaría el ${Math.round(HIGHZ_MAX_LOAD_RATIO * 100)} % de la potencia del canal. Bajá el tap, partí la línea en otro canal o sumá amplificación.`, fix: { generic: "amp-70v", label: "Sumar amplificador 70/100 V" } });
  }
  const missingData = res.estimates.filter((e) => e.kind === "missing");
  const defaults = res.estimates.filter((e) => e.kind === "default");
  if (missingData.length) findings.push({ id: "amp-estimated", level: "warn", title: "Amplificación con datos estimados", detail: `Sin verificar contra la ficha — ${missingData.map((e) => `dato estimado: ${e.text}`).join("; ")}.` });
  if (defaults.length) findings.push({ id: "amp-taps-default", level: "info", title: "Taps de 70/100 V elegidos por defecto", detail: `${defaults.map((e) => `dato estimado: ${e.text}`).join("; ")}. Fijá el tap si el proyecto pide otro nivel.` });
  return res.channels;
}

/** Cableado completo de la sala. */
export function planCabling(input: CablingInput): CablingPlan {
  const missing = input.nodes.filter((n) => !n.virtual && !n.ports);
  const nodes = input.nodes.filter((n): n is Ready => Boolean(n.ports));
  const links: CableLink[] = [];
  const findings: CableFinding[] = [];
  const used = new Map<string, number>();

  if (missing.length) {
    findings.push({
      id: "missing-datasheet",
      level: "error",
      title: `${missing.length} equipo(s) sin ficha leída`,
      detail: `No se cablean con suposiciones: ${missing.map((m) => m.label).join(", ")}. Leé sus fichas para completar el cableado.`,
      productIds: [...new Set(missing.map((m) => m.productId).filter((id): id is string => Boolean(id)))],
    });
  }

  const add = (from: Ready, to: Ready, signal: Signal, fromPort?: string, toPort?: string, note?: string) => {
    const kOut = `${from.id}|out|${signal}`;
    const kIn = `${to.id}|in|${signal}`;
    const o = (used.get(kOut) ?? 0) + 1;
    const i = (used.get(kIn) ?? 0) + 1;
    used.set(kOut, o);
    used.set(kIn, i);
    const route = routeCable(from, to, input.dims);
    const runM = r2(routeLength(route));
    const link: CableLink = {
      id: `${from.id}>${to.id}>${signal}${links.length}`,
      from: from.id,
      to: to.id,
      signal,
      fromPort: fromPort ?? `${SIGNAL_INFO[signal].label} ${o}`,
      toPort: toPort ?? `${SIGNAL_INFO[signal].label} ${i}`,
      route,
      runM,
      cableM: cableMeters(runM, signal),
      ...(note ? { note } : {}),
    };
    links.push(link);
    return link;
  };
  /** Señal en común (en el orden de preferencia) entre la salida de A y la entrada de B. */
  const common = (a: Ready, b: Ready, prefer: Signal[]): Signal | null => prefer.find((s) => (a.virtual || portCount(a.ports, "outputs", s) > 0) && (b.virtual || portCount(b.ports, "inputs", s) > 0)) ?? null;
  const of = (...cls: DeviceClass[]) => nodes.filter((n) => cls.includes(n.cls));
  const incompatible = (a: Ready, b: Ready, what: string, fix: string) =>
    findings.push({ id: `compat-${a.id}-${b.id}`, level: "error", title: `${what} sin señal en común`, detail: `${a.label} → ${b.label}: ${fix}` });
  const ctx: LinkCtx = { add, findings, nodes, links, remedies: input.remedies ?? {}, cableM: (a, b, signal) => cableMeters(routeLength(routeCable(a, b, input.dims)), signal) };

  // Puntos fuera de la sala o sobre la mesa.
  const ceilY = Math.max(2.2, input.dims.heightM - 0.03);
  const central: Ready | null = input.central
    ? { id: "central", label: input.central.label, cls: "other", ports: { inputs: [], outputs: [], network: 999 }, pos: { x: input.central.exit.x, y: ceilY, z: input.central.exit.z }, mount: "ceiling", virtual: true }
    : null;
  if (central) nodes.push(central);
  const displays = of("display");
  const codec = of("codec")[0] ?? null;
  // Conexión de mesa real (caja o placa para la notebook, en la cotización): reemplaza a la virtual.
  const presentationBase = (n: Ready) => (n.ports.wireless ?? []).some((w) => w.protocol === "wireless-presentation" && w.role === "base");
  const realTable = nodes.find((n) => n.cls === "source" && n.mount === "table" && !presentationBase(n) && portCount(n.ports, "outputs", "hdmi") > 0) ?? null;
  const table: Ready | null =
    realTable && displays.length
      ? realTable
      : input.tableInput && displays.length
      ? {
          id: "table",
          label: "Conexión de mesa (notebook)",
          cls: "source",
          ports: { inputs: [], outputs: [{ signal: "hdmi", count: 1, label: "HDMI" }, { signal: "usb", count: 1, label: "USB" }], network: 0 },
          pos: { x: input.tableInput.x, y: input.tableInput.topY, z: input.tableInput.z },
          mount: "table",
          virtual: true,
        }
      : null;
  if (table && table !== realTable) nodes.push(table);

  // Cámara con adaptador propio (PoE → USB, ej. Huddly L1): la cámara va por UTP al adaptador y este por USB al códec/PC.
  const camAdapter = nodes.find((n) => n.cls === "other" && !n.virtual && n.ports.poeSource && n.ports.network > 0 && portCount(n.ports, "outputs", "usb") > 0) ?? null;
  const adaptedCams = new Set(camAdapter ? of("camera").filter((c) => c.ports.network > 0).map((c) => c.id) : []);
  const viaAdapter = (n: Ready) => n === camAdapter || adaptedCams.has(n.id);

  // 1) Red: lo que tiene puerto de red va al switch (o al rack central).
  // Sin control ni videoconferencia, la red de amplificadores/DSP es solo de configuración: no obliga a un switch.
  const needsNetwork = (n: Ready) =>
    ["codec", "control", "touch", "streamer", "camera", "mic"].includes(n.cls) || Boolean(n.ports.danteTx || n.ports.danteRx) || presentationBase(n) || (n.cls === "source" && !n.virtual && n.ports.network > 0);
  const networked = nodes.filter((n) => n.cls !== "switch" && !n.virtual && n.ports.network > 0 && !viaAdapter(n));
  const netDevices = input.networkOptional && !networked.some(needsNetwork) ? [] : networked;
  let switchNode: Ready | null = of("switch")[0] ?? null;
  if (!switchNode && netDevices.length) {
    if (central) switchNode = central;
    else {
      const anchor = of("control", "dsp", "amp", "codec")[0] ?? null;
      switchNode = {
        id: "switch-new",
        label: "Switch de red (a sumar)",
        cls: "switch",
        ports: { inputs: [], outputs: [], network: netDevices.length },
        pos: anchor ? { ...anchor.pos } : { x: -input.dims.widthM / 2 + 0.3, y: 0.45, z: -input.dims.depthM / 2 + 0.3 },
        mount: anchor?.mount ?? "rack",
        virtual: true,
      };
      nodes.push(switchNode);
      const poe = netDevices.filter((n) => n.ports.poeWatts != null);
      findings.push({
        id: "net-switch-new",
        level: "error",
        title: "Falta el switch de red",
        fix: { generic: netDevices.length > 7 ? "poe-switch-24" : "poe-switch-8", label: "Sumar switch PoE" },
        detail: `${netDevices.length} equipo(s) van a la red (${netDevices.map((n) => n.label).join(", ")}).${poe.length ? ` ${poe.length} se alimentan por PoE (${Math.round(poe.reduce((s, n) => s + (n.ports.poeWatts ?? 0), 0))} W en total).` : ""} Sumá un switch con al menos ${netDevices.length + 1} puertos.`,
      });
    }
  }
  if (switchNode) {
    netDevices.forEach((n, k) => add(n, switchNode!, n.ports.danteTx || n.ports.danteRx ? "dante" : "lan", "Red", `Puerto ${k + 1}`));
    if (!switchNode.virtual) {
      if (netDevices.length > switchNode.ports.network) findings.push({ id: "net-ports", level: "error", title: "Puertos de red insuficientes", detail: `${switchNode.label} tiene ${switchNode.ports.network} puertos y van ${netDevices.length} equipos.` });
      const pds = netDevices.filter((n) => n.ports.poeWatts != null);
      const need = pds.reduce((s, n) => s + (n.ports.poeWatts ?? 0), 0);
      if (pds.length && !switchNode.ports.poeSource) findings.push({ id: "poe-none", level: "error", title: "El switch no da PoE", detail: `${pds.map((n) => n.label).join(", ")} se alimentan por PoE y ${switchNode.label} no declara PoE.` });
      else if (pds.length && switchNode.ports.poeBudgetWatts != null && need > switchNode.ports.poeBudgetWatts) findings.push({ id: "poe-budget", level: "error", title: "Presupuesto PoE excedido", detail: `Consumo PoE ${Math.round(need)} W > ${switchNode.ports.poeBudgetWatts} W del switch.` });
    }
  }

  // 2) Video: notebook → codec → pantallas (o notebook → pantalla).
  if (table) {
    if (codec) {
      if (portCount(codec.ports, "inputs", "hdmi") > 0) add(table, codec, "hdmi", "HDMI notebook", "Entrada HDMI");
      else findings.push({ id: "codec-ingest", level: "warn", title: "El codec no tiene entrada HDMI", detail: `${codec.label} no declara entrada HDMI: para compartir la notebook con cable hace falta un capturador/ingest HDMI→USB o compartir por la app.` });
      if (portCount(codec.ports, "inputs", "usb") > 0 && (of("camera").length || of("mic").length)) add(table, codec, "usb", "USB notebook", "USB");
    } else if (displays[0]) {
      if (portCount(displays[0].ports, "inputs", "hdmi") > 0) add(table, displays[0], "hdmi", "HDMI notebook", "HDMI");
      else incompatible(table, displays[0], "Notebook y pantalla", "la pantalla no declara entrada HDMI.");
    }
  }
  if (codec) {
    // HDMI a las pantallas cercanas; por HDBaseT (UTP + receptor junto a la pantalla) a las demás.
    const feed = feedDisplays(ctx, codec, displays);
    for (const d of feed.noHdmiIn) incompatible(codec, d, "Codec y pantalla", "la pantalla no declara entrada HDMI.");
    if (feed.unfed.length) findings.push({ id: "video-outs", level: "error", title: "Salidas de video insuficientes", detail: `${codec.label} tiene ${feed.outs} salida(s) de video y hay ${displays.length} pantallas: sumá un splitter o una matriz HDMI.` });
  } else if (of("video-switch").length) {
    const vs = of("video-switch")[0]!;
    const feed = feedDisplays(ctx, vs, displays);
    const outs = feed.outs;
    if (table && portCount(vs.ports, "inputs", "hdmi") > 0 && !links.some((l) => l.from === table.id)) add(table, vs, "hdmi", "HDMI notebook", "Entrada HDMI");
    // Las fuentes de la sala entran a la matriz.
    for (const src of of("source", "streamer").filter((s) => portCount(s.ports, "outputs", "hdmi") > 0)) {
      if (links.filter((l) => l.to === vs.id).length < portCount(vs.ports, "inputs", "hdmi")) add(src, vs, "hdmi", "Salida HDMI", "Entrada HDMI");
    }
    if (displays.length > outs) findings.push({ id: "video-outs", level: "error", title: "Salidas de video insuficientes", detail: `${vs.label} tiene ${outs} salida(s) y hay ${displays.length} pantallas.`, fix: { generic: "matrix-8x8", label: "Sumar matriz HDMI 8x8" } });
  } else if (displays.length > 1) {
    findings.push({ id: "video-split", level: "error", title: "Pantallas sin distribución de video", detail: `Hay ${displays.length} pantallas y ningún codec o matriz que las alimente: sumá un splitter/matriz HDMI.`, fix: { generic: "matrix-4x4", label: "Sumar matriz HDMI 4x4" } });
  }

  // 3) Cámaras al codec (o al USB de la mesa en salas BYOD).
  for (const cam of of("camera")) {
    const target = codec ?? table;
    if (!target) {
      findings.push({ id: `cam-none-${cam.id}`, level: "error", title: "Cámara sin equipo que la reciba", detail: `${cam.label}: no hay codec ni conexión de mesa en la sala para recibir su video.` });
      continue;
    }
    if (camAdapter && adaptedCams.has(cam.id)) {
      // Según la ficha: el RJ-45 de la cámara va a su adaptador (le da PoE) y el adaptador sale por USB a la PC/códec.
      add(cam, camAdapter, "lan", "RJ-45 (PoE desde el adaptador)", "Puerto de cámara (PoE)", "UTP directo, no pasa por el switch");
      if (!links.some((l) => l.from === camAdapter.id && l.signal === "usb")) add(camAdapter, target, "usb", "USB", "USB");
      continue;
    }
    const s = common(cam, target, ["usb", "hdmi"]);
    if (s) add(cam, target, s);
    else if (cam.ports.network > 0 && target.ports.network > 0) {
      /* cámara IP: va por la red */
    } else incompatible(cam, target, "Cámara y codec", "no comparten USB, HDMI ni red: hace falta un conversor.");
  }

  // 4) Micrófonos: USB al codec, analógicos al DSP; Dante por la red.
  const dsp = of("dsp")[0] ?? null;
  let micDante = 0;
  for (const mic of of("mic")) {
    micDante += mic.ports.danteTx ?? 0;
    // Con DSP en la sala, un micrófono que también sale en analógico va al DSP (el USB es solo de configuración o para uso suelto).
    // El nivel cuenta: un micrófono (nivel mic) solo entra en una entrada mic o mic/línea.
    const toDsp = Boolean(dsp && audioPair(mic, dsp));
    if (portCount(mic.ports, "outputs", "usb") > 0 && !toDsp) {
      const target = codec ?? table;
      if (target) add(mic, target, "usb");
      else findings.push({ id: `mic-usb-${mic.id}`, level: "error", title: "Micrófono USB sin equipo que lo reciba", detail: `${mic.label}: no hay codec ni conexión de mesa con USB en la sala.` });
    } else if (hasAudioOut(mic)) {
      const candidates = [dsp, codec, central].filter((t): t is Ready => Boolean(t));
      const target = candidates.find((t) => audioPair(mic, t)) ?? null;
      const problem = candidates.map((t) => ({ t, p: audioProblem(mic, t) })).find((x) => x.p);
      if (target) add(mic, target, audioPair(mic, target)!.signal, "Salida de audio", "Entrada de micrófono/línea");
      else if (problem) findings.push({ id: `mic-${mic.id}`, level: "error", title: "Micrófono sin entrada compatible", detail: `${mic.label} → ${problem.t.label}: ${problem.p!.text}.`, ...(problem.p!.fix === "dsp" ? { fix: { generic: "dsp", label: "Sumar procesador de audio (DSP)", near: { x: mic.pos.x, z: mic.pos.z } } } : {}) });
      else findings.push({ id: `mic-${mic.id}`, level: "error", title: "Micrófono sin entrada que lo reciba", detail: `${mic.label} sale en audio analógico y ningún equipo de la sala declara entradas de audio.`, fix: { generic: "dsp", label: "Sumar procesador de audio (DSP)", near: { x: mic.pos.x, z: mic.pos.z } } });
    } else if (mic.ports.network > 0 && !dsp && !codec && !central) {
      findings.push({ id: `mic-net-${mic.id}`, level: "error", title: "Micrófono de red sin procesador", detail: `${mic.label} entrega audio por red: sumá un DSP o codec que lo reciba.`, fix: { generic: "dsp", label: "Sumar procesador de audio (DSP)", near: { x: mic.pos.x, z: mic.pos.z } } });
    }
  }
  const rx = (dsp ?? codec)?.ports.danteRx;
  if (micDante && rx != null && micDante > rx) findings.push({ id: "dante-rx", level: "error", title: "Canales Dante insuficientes", detail: `Los micrófonos transmiten ${micDante} canales Dante y ${(dsp ?? codec)!.label} recibe ${rx}.` });

  // 5) Parlantes pasivos a los canales de los amplificadores, por carga real (impedancia o taps).
  const amps = of("amp");
  const passive = of("speaker", "subwoofer").filter((s) => portCount(s.ports, "inputs", "speaker") > 0);
  const amplification = wireSpeakers(amps, passive, central, input.audio ?? {}, add, findings);
  // Parlantes activos con entrada de línea.
  const audioIn = (n: Ready) => portCount(n.ports, "inputs", "line") + portCount(n.ports, "inputs", "digital") > 0;
  for (const spk of of("speaker", "subwoofer").filter((s) => audioIn(s) && portCount(s.ports, "inputs", "speaker") === 0)) {
    const sources = [dsp, codec, ...of("streamer")].filter((t): t is Ready => Boolean(t && hasAudioOut(t)));
    // Nivel y formato: directo si conectan; si no, con conversor (o el aviso con la solución).
    const src = sources.find((t) => audioPair(t, spk)) ?? sources[0] ?? null;
    if (src) feedAudio(ctx, src, spk, "Entrada de línea");
    else if (central) add(central, spk, "line", "Audio central", "Entrada de línea", "Tramo hasta la sala técnica aparte");
    else findings.push({ id: `spk-line-${spk.id}`, level: "error", title: "Parlante activo sin fuente de audio", detail: `${spk.label}: ningún DSP, codec o streamer de la sala declara salida de línea para alimentarlo.`, fix: { generic: "audio-streamer", label: "Sumar streamer de audio", near: { x: spk.pos.x, z: spk.pos.z } } });
  }

  // 6) Entrada de los amplificadores: por Dante si ambos están en red; si no, línea.
  // Receptor AV (amplificador con entradas y salida HDMI): el audio le llega por HDMI desde las fuentes.
  const isAvr = (n: Ready) => n.cls === "amp" && portCount(n.ports, "inputs", "hdmi") > 0 && portCount(n.ports, "outputs", "hdmi") > 0;
  for (const amp of amps) {
    // Amplificador del rack central: su fuente (streamer del rack) se resuelve a nivel proyecto.
    if (amp.id.startsWith("central:")) continue;
    if (isAvr(amp)) continue;
    if (dsp && amp.ports.danteRx && dsp.ports.danteTx) continue;
    const sources = [dsp, ...of("streamer"), codec].filter((t): t is Ready => Boolean(t && hasAudioOut(t)));
    const src = sources.find((t) => audioPair(t, amp)) ?? sources[0] ?? null;
    // Directo si el nivel/formato coincide; una fuente solo óptica pasa por un DAC (o avisa que falta).
    if (src && audioIn(amp)) feedAudio(ctx, src, amp, "Entrada de línea");
    else if (!src) findings.push({ id: `amp-src-${amp.id}`, level: "warn", title: "Amplificador sin fuente de audio", detail: `${amp.label}: ningún DSP, streamer ni codec de la sala declara salida de audio para alimentarlo.`, fix: { generic: "audio-streamer", label: "Sumar streamer de audio", near: { x: amp.pos.x, z: amp.pos.z } } });
  }

  // 7) Control de pantallas: RS-232 si las dos puntas lo declaran; si no IR; si no, por red.
  const control = of("control")[0] ?? null;
  if (control) {
    for (const d of displays) {
      const s = common(control, d, ["rs232", "ir"]);
      if (s) add(control, d, s, undefined, s === "rs232" ? "RS-232" : "IR");
    }
  }

  // Cine: fuente → receptor AV (decodifica el envolvente) → pantalla.
  const avr = amps.find((a) => !a.id.startsWith("central:") && isAvr(a)) ?? null;
  if (avr) {
    const sources = of("source", "streamer").filter((s) => s !== table && portCount(s.ports, "outputs", "hdmi") > 0);
    sources.slice(0, portCount(avr.ports, "inputs", "hdmi")).forEach((s) => add(s, avr, "hdmi", "Salida HDMI", "Entrada HDMI"));
    const screen = displays.find((d) => portCount(d.ports, "inputs", "hdmi") > 0 && !links.some((l) => l.to === d.id && (l.signal === "hdmi" || l.signal === "hdbaset")));
    if (sources.length && screen) add(avr, screen, "hdmi", "Salida HDMI (a la pantalla)", "Entrada HDMI");
  }

  // Pantallas que siguen sin video: las alimenta un reproductor/streamer de la sala con salida HDMI libre.
  const videoSources = of("source", "streamer").filter((s) => portCount(s.ports, "outputs", "hdmi") > 0 && !(avr && links.some((l) => l.from === s.id && l.to === avr.id)));
  const usedOuts = new Map<string, number>();
  for (const d of displays) {
    if (links.some((l) => l.to === d.id && (l.signal === "hdmi" || l.signal === "hdbaset"))) continue;
    const src = videoSources.find((s) => (usedOuts.get(s.id) ?? 0) < portCount(s.ports, "outputs", "hdmi"));
    if (src && portCount(d.ports, "inputs", "hdmi") > 0) {
      usedOuts.set(src.id, (usedOuts.get(src.id) ?? 0) + 1);
      add(src, d, "hdmi", "Salida HDMI", "Entrada HDMI");
      continue;
    }
    findings.push({ id: `display-src-${d.id}`, level: "warn", title: "Pantalla sin fuente de video", detail: `${d.label} no recibe señal: sumá la fuente que corresponda (reproductor de cartelería, codec, matriz o conexión de mesa).`, fix: { ...(table ? { generic: "wireless-presentation", label: "Sumar presentación inalámbrica (sin cables a la mesa)" } : { generic: "media-player", label: "Sumar reproductor / streaming" }), near: { x: d.pos.x, z: d.pos.z } } });
  }

  // Presentación inalámbrica que quedó sin salida (la pantalla ya recibe el códec): a otra entrada HDMI de la pantalla.
  for (const base of of("source").filter((s) => presentationBase(s) && !links.some((l) => l.from === s.id && l.signal === "hdmi"))) {
    const d = displays.find((x) => (used.get(`${x.id}|in|hdmi`) ?? 0) < portCount(x.ports, "inputs", "hdmi"));
    if (d) add(base, d, "hdmi", "Salida HDMI", `Entrada HDMI ${(used.get(`${d.id}|in|hdmi`) ?? 0) + 1}`);
  }

  // 8) Enlaces UTP propietarios (Hall ULTRA, Osiris…): emisor ↔ receptor de la misma familia.
  proprietaryLinks(ctx);

  // 9) Conexiones inalámbricas: cada cliente con su gateway / receptor / base, y su capacidad.
  wirelessLinks(nodes, links, findings);

  // Red de seguridad: ningún equipo con conexiones queda suelto sin un aviso que lo nombre.
  const mentioned = () => findings.map((f) => `${f.title} ${f.detail}`).join(" | ");
  for (const n of nodes) {
    if (n.virtual) continue;
    const p = n.ports;
    const hasAny = p.inputs.length || p.outputs.length || p.network || (p.wireless ?? []).length;
    if (!hasAny || links.some((l) => l.from === n.id || l.to === n.id) || mentioned().includes(n.label)) continue;
    const kinds = [...new Set([...p.inputs, ...p.outputs].map((g) => SIGNAL_INFO[g.signal].label))].join(", ") || (p.wireless ?? []).map((w) => WIRELESS_LABEL[w.protocol] ?? w.protocol).join(", ");
    findings.push({ id: `orphan-${n.id}`, level: "warn", title: "Equipo sin conectar", detail: `${n.label}: no hay en la sala un equipo compatible con sus puertos (${kinds}).` });
  }

  // Puertos usados de más (solo equipos reales).
  for (const [key, n] of used) {
    const [id, side, signal] = key.split("|") as [string, "in" | "out", Signal];
    const node = nodes.find((x) => x.id === id);
    if (!node || node.virtual || signal === "lan" || signal === "dante" || signal === "wireless") continue;
    // Salidas de parlante: varios parlantes por canal (lo controla la asignación de canales).
    if (signal === "speaker" && side === "out") continue;
    const have = portCount(node.ports, side === "in" ? "inputs" : "outputs", signal);
    if (n > have) findings.push({ id: `ports-${key}`, level: "error", title: `Faltan puertos ${SIGNAL_INFO[signal].label}`, detail: `${node.label} declara ${have} ${side === "in" ? "entrada(s)" : "salida(s)"} ${SIGNAL_INFO[signal].label} y el diseño usa ${n}.` });
  }

  // Validaciones de largo: alcance real de cada señal según las fichas (signal-reach.ts), con la solución.
  lengthFindings(ctx);

  const totals = [...new Set(links.filter((l) => l.signal !== "wireless").map((l) => l.signal))].map((signal) => {
    const ls = links.filter((l) => l.signal === signal);
    return { signal, count: ls.length, meters: Math.round(ls.reduce((n, l) => n + l.cableM, 0) * 10) / 10 };
  });
  return { nodes, links, findings, totals, missing, amplification };
}
