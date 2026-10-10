/**
 * Cableado de una sala con los puertos REALES de cada equipo (ficha del
 * fabricante): qué cable va de qué equipo a cuál, por dónde pasa (subida por
 * pared, cielorraso, bajada) y cuántos metros lleva. Valida señal, puertos
 * libres, largos, PoE, canales Dante y línea de parlantes. Un equipo sin ficha
 * leída no se cablea con suposiciones: queda marcado como pendiente.
 */

import { SIGNAL_INFO, portCount, type DeviceClass, type DevicePorts, type Signal } from "./device-ports";

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

export type CableFinding = { id: string; level: "info" | "warn" | "error"; title: string; detail: string; linkId?: string; productIds?: string[] };

export type CablingInput = {
  nodes: CableNode[];
  dims: { widthM: number; depthM: number; heightM: number };
  /** Conexión de mesa para la notebook (caja de piso / mesa), si la sala tiene mesa de reunión. */
  tableInput?: { x: number; z: number; topY: number } | null;
  /** Equipamiento central fuera de la sala (sala técnica / rack del proyecto). */
  central?: { label: string; exit: { x: number; z: number } } | null;
};

export type CablingPlan = {
  nodes: CableNode[];
  links: CableLink[];
  findings: CableFinding[];
  totals: Array<{ signal: Signal; count: number; meters: number }>;
  /** Equipos que no se pudieron cablear por falta de ficha. */
  missing: CableNode[];
};

/** Rulo de servicio en cada punta (m). */
const SERVICE_LOOP_M = 0.6;
/** Holgura del recorrido (curvas, bandeja). */
const SLACK = 1.1;
/** Largos estándar de cables armados (m). */
const STANDARD_LENGTHS = [1, 2, 3, 5, 7.5, 10, 15, 20, 25, 30, 40, 50];
/** Señales que se arman con cable de rollo (se compra por metro). */
const BULK: Signal[] = ["lan", "dante", "hdbaset", "speaker", "line", "rs232", "ir"];
/** Largos máximos sin extensor. */
const HDMI_MAX_M = 10;
const USB_MAX_M = 5;
const UTP_MAX_M = 90;
/** Parlantes por canal en baja impedancia (dos de 8 Ω en paralelo = 4 Ω). */
const LOWZ_PER_CHANNEL = 2;

const r2 = (n: number) => Math.round(n * 100) / 100;
const isHighZ = (v: string | null | undefined) => v === "70v" || v === "100v" || v === "both";

/** Recorrido de un cable: sube (o baja por el piso hasta la pared y sube), cruza por el cielorraso y baja. */
export function routeCable(a: CableNode, b: CableNode, dims: CablingInput["dims"]): Point3[] {
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

/** Metros de cable a comprar para un recorrido. */
export function cableMeters(runM: number, signal: Signal): number {
  const need = runM * SLACK + 2 * SERVICE_LOOP_M;
  if (BULK.includes(signal)) return Math.ceil(need);
  return STANDARD_LENGTHS.find((l) => l >= need) ?? Math.ceil(need / 10) * 10;
}

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
            ? { id: `wl-${w.protocol}-${client.id}`, level: "error", title: `Falta ${peer.name}`, detail: `${client.label} se conecta por ${name} y no hay ${peer.name} en la sala.` }
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
        findings.push({ id: `wl-cap-${host.id}-${w.protocol}`, level: "error", title: `${peer.name} sin capacidad`, detail: `${host.label} admite ${cap} dispositivo(s) ${name} y el diseño usa ${used}.` });
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

/** Sección de cable de parlante según el largo (baja impedancia). */
export function speakerGauge(runM: number, highZ: boolean): string {
  if (highZ) return "Cable de parlante 2×1,5 mm² (16 AWG) — línea de tensión constante";
  if (runM <= 15) return "Cable de parlante 2×1,5 mm² (16 AWG)";
  if (runM <= 30) return "Cable de parlante 2×2,5 mm² (14 AWG)";
  return "Cable de parlante 2×4 mm² (12 AWG)";
}

type Ready = CableNode & { ports: DevicePorts };

/** Cableado completo de la sala. */
export function planCabling(input: CablingInput): CablingPlan {
  const missing = input.nodes.filter((n) => !n.virtual && !n.ports);
  const nodes = input.nodes.filter((n): n is Ready => Boolean(n.ports));
  const links: CableLink[] = [];
  const findings: CableFinding[] = [];
  const used = new Map<string, number>();
  const label = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;

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

  // Puntos fuera de la sala o sobre la mesa.
  const ceilY = Math.max(2.2, input.dims.heightM - 0.03);
  const central: Ready | null = input.central
    ? { id: "central", label: input.central.label, cls: "other", ports: { inputs: [], outputs: [], network: 999 }, pos: { x: input.central.exit.x, y: ceilY, z: input.central.exit.z }, mount: "ceiling", virtual: true }
    : null;
  if (central) nodes.push(central);
  const displays = of("display");
  const codec = of("codec")[0] ?? null;
  const table: Ready | null =
    input.tableInput && displays.length
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
  if (table) nodes.push(table);

  // 1) Red: lo que tiene puerto de red va al switch (o al rack central).
  const netDevices = nodes.filter((n) => n.cls !== "switch" && !n.virtual && n.ports.network > 0);
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
    const outs = portCount(codec.ports, "outputs", "hdmi");
    displays.forEach((d, k) => {
      if (k >= outs) return;
      if (portCount(d.ports, "inputs", "hdmi") > 0) add(codec, d, "hdmi", `Salida HDMI ${k + 1}`, "Entrada HDMI");
      else incompatible(codec, d, "Codec y pantalla", "la pantalla no declara entrada HDMI.");
    });
    if (displays.length > outs) findings.push({ id: "video-outs", level: "error", title: "Salidas de video insuficientes", detail: `${codec.label} tiene ${outs} salida(s) HDMI y hay ${displays.length} pantallas: sumá un splitter o una matriz HDMI.` });
  } else if (displays.length > 1) {
    findings.push({ id: "video-split", level: "error", title: "Pantallas sin distribución de video", detail: `Hay ${displays.length} pantallas y ningún codec o matriz que las alimente: sumá un splitter/matriz HDMI.` });
  }

  // 3) Cámaras al codec (o al USB de la mesa en salas BYOD).
  for (const cam of of("camera")) {
    const target = codec ?? table;
    if (!target) {
      findings.push({ id: `cam-none-${cam.id}`, level: "error", title: "Cámara sin equipo que la reciba", detail: `${cam.label}: no hay codec ni conexión de mesa en la sala para recibir su video.` });
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
    if (portCount(mic.ports, "outputs", "usb") > 0) {
      const target = codec ?? table;
      if (target) add(mic, target, "usb");
      else findings.push({ id: `mic-usb-${mic.id}`, level: "error", title: "Micrófono USB sin equipo que lo reciba", detail: `${mic.label}: no hay codec ni conexión de mesa con USB en la sala.` });
    } else if (portCount(mic.ports, "outputs", "line") > 0) {
      const target = [dsp, codec, central].find((t): t is Ready => Boolean(t && (t.virtual || portCount(t.ports, "inputs", "line") > 0))) ?? null;
      if (target) add(mic, target, "line", "Salida de audio", "Entrada de micrófono/línea");
      else findings.push({ id: `mic-${mic.id}`, level: "error", title: "Micrófono sin entrada que lo reciba", detail: `${mic.label} sale en audio analógico y ningún equipo de la sala declara entradas de audio.` });
    } else if (mic.ports.network > 0 && !dsp && !codec && !central) {
      findings.push({ id: `mic-net-${mic.id}`, level: "error", title: "Micrófono de red sin procesador", detail: `${mic.label} entrega audio por red: sumá un DSP o codec que lo reciba.` });
    }
  }
  const rx = (dsp ?? codec)?.ports.danteRx;
  if (micDante && rx != null && micDante > rx) findings.push({ id: "dante-rx", level: "error", title: "Canales Dante insuficientes", detail: `Los micrófonos transmiten ${micDante} canales Dante y ${(dsp ?? codec)!.label} recibe ${rx}.` });

  // 5) Parlantes pasivos a los canales de los amplificadores.
  const amps = of("amp");
  const channels = amps.flatMap((a) => Array.from({ length: portCount(a.ports, "outputs", "speaker") }, (_, k) => ({ amp: a, ch: k + 1, load: 0 })));
  const passive = of("speaker", "subwoofer").filter((s) => portCount(s.ports, "inputs", "speaker") > 0);
  for (const spk of passive) {
    if (!channels.length) {
      if (central) add(central, spk, "speaker", "Amplificación central", "Entrada", "Tramo hasta la sala técnica aparte");
      continue;
    }
    const slot = [...channels].sort((a, b) => a.load - b.load)[0]!;
    const highZ = isHighZ(slot.amp.ports.lineVoltage);
    if (highZ && spk.ports.lineVoltage === "low-z") findings.push({ id: `line-${spk.id}`, level: "error", title: "Parlante de baja impedancia en línea de 70/100 V", detail: `${spk.label} no tiene transformador declarado y ${slot.amp.label} trabaja en tensión constante.` });
    if (!highZ && slot.load >= LOWZ_PER_CHANNEL) {
      findings.push({ id: `amp-load-${spk.id}`, level: "error", title: "Canales de amplificación insuficientes", detail: `${spk.label} no tiene canal libre: cada canal en baja impedancia admite hasta ${LOWZ_PER_CHANNEL} parlantes.` });
      continue;
    }
    slot.load++;
    const l = add(slot.amp, spk, "speaker", `Canal ${slot.ch}`, "Entrada");
    l.note = speakerGauge(l.runM, highZ);
  }
  if (passive.length && !channels.length && !central) findings.push({ id: "spk-no-amp", level: "error", title: "Parlantes pasivos sin amplificador", detail: `${passive.length} parlante(s) pasivo(s) necesitan amplificación: ${passive.map((p) => p.label).join(", ")}.` });
  // Parlantes activos con entrada de línea.
  for (const spk of of("speaker", "subwoofer").filter((s) => portCount(s.ports, "inputs", "line") > 0 && portCount(s.ports, "inputs", "speaker") === 0)) {
    const src = [dsp, codec, ...of("streamer")].find((t): t is Ready => Boolean(t && portCount(t.ports, "outputs", "line") > 0)) ?? null;
    if (src) add(src, spk, "line", "Salida de audio", "Entrada de línea");
    else if (central) add(central, spk, "line", "Audio central", "Entrada de línea", "Tramo hasta la sala técnica aparte");
    else findings.push({ id: `spk-line-${spk.id}`, level: "error", title: "Parlante activo sin fuente de audio", detail: `${spk.label}: ningún DSP, codec o streamer de la sala declara salida de línea para alimentarlo.` });
  }

  // 6) Entrada de los amplificadores: por Dante si ambos están en red; si no, línea.
  for (const amp of amps) {
    if (dsp && amp.ports.danteRx && dsp.ports.danteTx) continue;
    const src = [dsp, ...of("streamer"), codec].find((t): t is Ready => Boolean(t && portCount(t.ports, "outputs", "line") > 0)) ?? null;
    if (src && portCount(amp.ports, "inputs", "line") > 0) add(src, amp, "line", "Salida de audio", "Entrada de línea");
    else if (!src) findings.push({ id: `amp-src-${amp.id}`, level: "warn", title: "Amplificador sin fuente de audio", detail: `${amp.label}: ningún DSP, streamer ni codec de la sala declara salida de audio para alimentarlo.` });
  }

  // 7) Control de pantallas: RS-232 si las dos puntas lo declaran; si no IR; si no, por red.
  const control = of("control")[0] ?? null;
  if (control) {
    for (const d of displays) {
      const s = common(control, d, ["rs232", "ir"]);
      if (s) add(control, d, s, undefined, s === "rs232" ? "RS-232" : "IR");
    }
  }

  // Pantallas sin señal de video: les falta una fuente (reproductor, codec, matriz o conexión de mesa).
  for (const d of displays) {
    if (!links.some((l) => l.to === d.id && (l.signal === "hdmi" || l.signal === "hdbaset"))) {
      findings.push({ id: `display-src-${d.id}`, level: "warn", title: "Pantalla sin fuente de video", detail: `${d.label} no recibe señal: sumá la fuente que corresponda (reproductor de cartelería, codec, matriz o conexión de mesa).` });
    }
  }

  // 8) Conexiones inalámbricas: cada cliente con su gateway / receptor / base, y su capacidad.
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
    const have = portCount(node.ports, side === "in" ? "inputs" : "outputs", signal);
    if (n > have) findings.push({ id: `ports-${key}`, level: "error", title: `Faltan puertos ${SIGNAL_INFO[signal].label}`, detail: `${node.label} declara ${have} ${side === "in" ? "entrada(s)" : "salida(s)"} ${SIGNAL_INFO[signal].label} y el diseño usa ${n}.` });
  }

  // Validaciones de largo.
  for (const l of links) {
    if (l.signal === "hdmi" && l.cableM > HDMI_MAX_M) {
      l.note = "Usar HDMI óptico (AOC) o extensor HDBaseT";
      findings.push({ id: `len-${l.id}`, level: "warn", title: `HDMI de ${l.cableM} m`, detail: `${label(l.from)} → ${label(l.to)}: más de ${HDMI_MAX_M} m no es confiable en cobre. Usá HDMI óptico o un extensor HDBaseT.`, linkId: l.id });
    }
    if (l.signal === "usb" && l.cableM > USB_MAX_M) {
      l.note = "Usar USB activo o extensor por UTP";
      findings.push({ id: `len-${l.id}`, level: "warn", title: `USB de ${l.cableM} m`, detail: `${label(l.from)} → ${label(l.to)}: USB pasa de ${USB_MAX_M} m. Usá un cable activo o un extensor USB por UTP.`, linkId: l.id });
    }
    if ((l.signal === "lan" || l.signal === "dante" || l.signal === "hdbaset") && l.runM > UTP_MAX_M) {
      findings.push({ id: `len-${l.id}`, level: "error", title: `Tramo de red de ${l.runM} m`, detail: `Supera los ${UTP_MAX_M} m de un tramo UTP: hace falta un switch intermedio o fibra.`, linkId: l.id });
    }
  }

  const totals = [...new Set(links.filter((l) => l.signal !== "wireless").map((l) => l.signal))].map((signal) => {
    const ls = links.filter((l) => l.signal === signal);
    return { signal, count: ls.length, meters: Math.round(ls.reduce((n, l) => n + l.cableM, 0) * 10) / 10 };
  });
  return { nodes, links, findings, totals, missing };
}
