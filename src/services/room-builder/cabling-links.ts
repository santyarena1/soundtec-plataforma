/**
 * Reglas de enlace del motor de cableado (cabling.ts), con criterio de
 * integrador:
 *
 * - Largos: cada cable contra el alcance REAL de su señal (signal-reach.ts:
 *   resolución del HDMI, versión de USB, HDBaseT 4K/1080p, lo que diga la
 *   ficha) y, si se pasa, la solución concreta (AOC, extensor, USB activo).
 * - Video a pantallas: HDMI a las cercanas; por las salidas HDBaseT (UTP) a las
 *   demás, hasta un receptor junto a la pantalla y de ahí un HDMI corto.
 * - Enlaces UTP propietarios (Hall ULTRA, Osiris…): solo con la misma familia.
 * - Audio: nivel mic / línea y digital óptico / coaxial; lo que no conecta
 *   directo pide preamplificador o conversor (DAC).
 */

import { audioFits, audioMismatch, AUDIO_KIND_LABEL, type AudioKind } from "./audio-level";
import type { CableFinding, CableLink, CableNode } from "./cabling";
import { SIGNAL_INFO, portCount, type DevicePorts, type PortGroup, type Signal } from "./device-ports";
import { familiesMatch } from "./io-profile/types";
import { reachFor, remedyFor, type ReachCatalog, type ReachEnd } from "./signal-reach";

export type Ready = CableNode & { ports: DevicePorts };
export type AddLink = (from: Ready, to: Ready, signal: Signal, fromPort?: string, toPort?: string, note?: string) => CableLink;

export type LinkCtx = {
  add: AddLink;
  findings: CableFinding[];
  /** Equipos de la sala (los receptores a sumar se agregan acá). */
  nodes: Ready[];
  links: CableLink[];
  /** Metros de cable que llevaría un tramo entre dos equipos (misma fórmula que el plan). */
  cableM: (a: Ready, b: Ready, signal: Signal) => number;
  remedies: ReachCatalog;
};

/* ───────────── Largos ───────────── */

/** Lo que declara la ficha de una punta para la señal del cable (resolución, USB, largo del puerto). */
export function reachEnd(n: Ready | undefined, signal: Signal, side: "inputs" | "outputs"): ReachEnd {
  if (!n) return {};
  const groups = n.ports[side].filter((g) => g.signal === signal);
  const declared = groups.map((g) => g.maxLengthM).filter((m): m is number => typeof m === "number" && m > 0);
  return {
    maxVideo: n.ports.maxVideo ?? null,
    hdcp: n.ports.hdcp ?? null,
    usbVersion: n.ports.usbVersion ?? null,
    portMaxM: declared.length ? Math.max(...declared) : null,
    portText: groups.map((g) => `${g.label} ${g.evidence ?? ""}`).join(" ").trim() || null,
  };
}

/** Nota del cable cuando se pasa del alcance (la cotización elige un cable óptico/activo). */
const LONG_NOTE: Partial<Record<Signal, string>> = { hdmi: "Usar HDMI óptico (AOC) o extensor HDBaseT", usb: "Usar USB activo o extensor por UTP" };

function lengthTitle(l: CableLink): string {
  if (l.signal === "lan" || l.signal === "dante") return `Tramo de red de ${l.cableM} m`;
  if (l.signal === "cat") return `Enlace propietario de ${l.cableM} m`;
  return `${SIGNAL_INFO[l.signal].label.replace(/ \(UTP\)$/, "")} de ${l.cableM} m`;
}

/** Cada cable contra el alcance de su señal: aviso (o error en UTP) con la solución concreta. */
export function lengthFindings(ctx: Pick<LinkCtx, "nodes" | "links" | "findings" | "remedies">): void {
  const byId = new Map(ctx.nodes.map((n) => [n.id, n]));
  for (const l of ctx.links) {
    if (l.signal === "wireless") continue;
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    const reach = reachFor(l.signal, reachEnd(a, l.signal, "outputs"), reachEnd(b, l.signal, "inputs"));
    if (!reach) continue;
    const route = `${a?.label ?? l.from} → ${b?.label ?? l.to}`;
    if (l.cableM > reach.maxM) {
      const remedy = remedyFor(reach, l.cableM, ctx.remedies);
      if (!reach.hard && LONG_NOTE[l.signal]) l.note = LONG_NOTE[l.signal];
      ctx.findings.push({ id: `len-${l.id}`, level: reach.hard ? "error" : "warn", title: lengthTitle(l), detail: `${route}: ${reach.basis} llega a ${reach.maxM} m. Solución: ${remedy.text}`, linkId: l.id });
    } else if (l.cableM > reach.warnFromM) {
      ctx.findings.push({ id: `len-edge-${l.id}`, level: "warn", title: `${lengthTitle(l)} (al límite)`, detail: `${route}: ${reach.basis} llega a ${reach.maxM} m y el aviso corre desde ${reach.warnFromM} m. Usar cable certificado (Premium / Ultra High Speed) y probarlo en obra; si el tramo crece, ${remedyFor(reach, l.cableM, ctx.remedies).text}`, linkId: l.id });
    }
  }
}

/* ───────────── Video a las pantallas ───────────── */

/** Receptor HDBaseT de la sala (entrada HDBaseT y salida HDMI) libre, el más cercano a la pantalla. */
function freeReceiver(ctx: LinkCtx, src: Ready, display: Ready): Ready | null {
  const usedRx = new Set(ctx.links.filter((l) => l.signal === "hdbaset").map((l) => l.to));
  const rxs = ctx.nodes.filter((n) => n !== src && n !== display && n.cls !== "display" && n.cls !== "video-switch" && n.cls !== "codec" && !usedRx.has(n.id) && portCount(n.ports, "inputs", "hdbaset") > 0 && portCount(n.ports, "outputs", "hdmi") > 0);
  const d2 = (n: Ready) => Math.hypot(n.pos.x - display.pos.x, n.pos.z - display.pos.z);
  return rxs.sort((x, y) => d2(x) - d2(y))[0] ?? null;
}

/** Receptor a sumar detrás de la pantalla (punta virtual, con su aviso y la solución). */
function newReceiver(ctx: LinkCtx, src: Ready, display: Ready): Ready {
  const k = ctx.nodes.filter((n) => n.id.startsWith(RX_NEW_PREFIX)).length + 1;
  const name = ctx.remedies.hdbasetRx?.name ?? null;
  const rx: Ready = {
    id: `${RX_NEW_PREFIX}${k}`,
    label: name ? `Receptor HDBaseT (a sumar: ${name})` : "Receptor HDBaseT (a sumar)",
    cls: "other",
    ports: { inputs: [{ signal: "hdbaset", count: 1, label: "HDBaseT IN" }], outputs: [{ signal: "hdmi", count: 1, label: "HDMI OUT" }], network: 0 },
    // Detrás de la pantalla, un poco más abajo (montaje de pared): el HDMI al display queda corto.
    pos: { x: display.pos.x, y: Math.max(0.3, display.pos.y - RX_BELOW_DISPLAY_M), z: display.pos.z },
    mount: "wall",
    virtual: true,
  };
  ctx.nodes.push(rx);
  ctx.findings.push({
    id: `hdbt-rx-${display.id}`,
    level: "error",
    title: `Falta receptor HDBaseT para ${display.label}`,
    detail: `${src.label} sale por HDBaseT (cable UTP) hacia ${display.label}, que no tiene entrada HDBaseT: va un receptor HDBaseT detrás de la pantalla (${name ? `${name}, del catálogo` : "genérico: no hay receptor compatible en el catálogo"}) y de ahí un HDMI corto.`,
    fix: { generic: "hdbaset-rx", label: "Sumar receptor HDBaseT", near: { x: display.pos.x, z: display.pos.z } },
  });
  return rx;
}

/** Prefijo de los receptores HDBaseT que el motor propone sumar (puntas virtuales). */
export const RX_NEW_PREFIX = "rx-new-";
/** El receptor va detrás de la pantalla, esta distancia más abajo que su centro (m). */
const RX_BELOW_DISPLAY_M = 0.35;

/** Salida HDBaseT k de la fuente a la pantalla: directo si la pantalla tiene entrada HDBaseT; si no, por un receptor. */
function hdbaseTo(ctx: LinkCtx, src: Ready, display: Ready, k: number): void {
  if (portCount(display.ports, "inputs", "hdbaset") > 0) {
    ctx.add(src, display, "hdbaset", `Salida HDBaseT ${k}`, "Entrada HDBaseT");
    return;
  }
  const rx = freeReceiver(ctx, src, display) ?? newReceiver(ctx, src, display);
  ctx.add(src, rx, "hdbaset", `Salida HDBaseT ${k}`, "Entrada HDBaseT", "UTP Cat6 hasta el receptor junto a la pantalla");
  ctx.add(rx, display, "hdmi", "Salida HDMI", "Entrada HDMI", "HDMI corto desde el receptor");
}

export type FeedResult = { outs: number; unfed: Ready[]; noHdmiIn: Ready[] };

/**
 * Video de una fuente que reparte (códec o matriz) a las pantallas: HDMI a las más
 * cercanas mientras el largo lo permita; por las salidas HDBaseT a las demás (o a las que
 * quedan lejos para un HDMI pasivo).
 */
export function feedDisplays(ctx: LinkCtx, src: Ready, displays: Ready[]): FeedResult {
  const hdmiOuts = portCount(src.ports, "outputs", "hdmi");
  const hdbtOuts = portCount(src.ports, "outputs", "hdbaset");
  let hdmiUsed = 0;
  let hdbtUsed = 0;
  const unfed: Ready[] = [];
  const noHdmiIn: Ready[] = [];
  const sorted = displays.map((d, i) => ({ d, i, m: ctx.cableM(src, d, "hdmi") })).sort((a, b) => a.m - b.m || a.i - b.i);
  for (const { d, m } of sorted) {
    const hdmiIn = portCount(d.ports, "inputs", "hdmi") > 0;
    const reach = reachFor("hdmi", reachEnd(src, "hdmi", "outputs"), reachEnd(d, "hdmi", "inputs"));
    const tooLong = reach ? m > reach.maxM : false;
    const canHdmi = hdmiUsed < hdmiOuts && hdmiIn;
    const canHdbt = hdbtUsed < hdbtOuts;
    if (canHdbt && (!canHdmi || tooLong)) {
      hdbaseTo(ctx, src, d, ++hdbtUsed);
      continue;
    }
    if (canHdmi) {
      ctx.add(src, d, "hdmi", `Salida HDMI ${++hdmiUsed}`, "Entrada HDMI");
      continue;
    }
    if (!hdmiIn && hdmiUsed < hdmiOuts) noHdmiIn.push(d);
    else unfed.push(d);
  }
  return { outs: hdmiOuts + hdbtOuts, unfed, noHdmiIn };
}

/* ───────────── Enlaces UTP propietarios ───────────── */

/**
 * Emisor ↔ receptor de la misma familia (Hall ULTRA-4K, ULTRA-V, GEM-EX, Osiris…) por
 * su UTP propio. Nunca con HDBaseT ni con otra familia.
 */
export function proprietaryLinks(ctx: LinkCtx): void {
  const taken = new Map<string, number>();
  const key = (n: Ready, g: PortGroup) => `${n.id}|${g.family}|${g.label}`;
  const free = (n: Ready, g: PortGroup) => (taken.get(key(n, g)) ?? 0) < g.count;
  const take = (n: Ready, g: PortGroup) => taken.set(key(n, g), (taken.get(key(n, g)) ?? 0) + 1);
  const isBidir = (n: Ready, g: PortGroup) => n.ports.inputs.some((x) => x.signal === "cat" && x.family === g.family && x.label === g.label);
  const cat = (n: Ready, side: "inputs" | "outputs") => n.ports[side].filter((g) => g.signal === "cat" && g.family);
  const pending: Array<{ n: Ready; g: PortGroup; bidir: boolean }> = [];
  // 1) Salidas puras (emisor) contra entradas (receptor) de la misma familia.
  for (const a of ctx.nodes) {
    for (const g of cat(a, "outputs")) {
      const bidir = isBidir(a, g);
      for (let k = 0; k < g.count && free(a, g); k++) {
        const peer = ctx.nodes.flatMap((b) => (b === a ? [] : cat(b, "inputs").filter((x) => familiesMatch(x.family, g.family) && free(b, x) && !(bidir && isBidir(b, x))).map((x) => ({ b, x }))))[0];
        if (!peer) break;
        take(a, g);
        take(peer.b, peer.x);
        ctx.add(a, peer.b, "cat", g.label, peer.x.label, `UTP del enlace ${g.family} (no es HDBaseT)`);
      }
      if (free(a, g)) pending.push({ n: a, g, bidir });
    }
  }
  // 2) Puertos de enlace bidireccionales que siguen libres: entre sí (misma familia).
  const loose = pending.filter((p) => p.bidir);
  for (let i = 0; i < loose.length; i++) {
    const p = loose[i]!;
    const q = loose.slice(i + 1).find((x) => x.n !== p.n && familiesMatch(x.g.family, p.g.family) && free(x.n, x.g));
    if (!q || !free(p.n, p.g)) continue;
    take(p.n, p.g);
    take(q.n, q.g);
    ctx.add(p.n, q.n, "cat", p.g.label, q.g.label, `UTP del enlace ${p.g.family} (no es HDBaseT)`);
  }
  // 3) Lo que quedó sin pareja: avisa con qué empareja.
  for (const n of ctx.nodes) {
    for (const g of [...cat(n, "outputs"), ...cat(n, "inputs").filter((x) => !isBidir(n, x))]) {
      if (!free(n, g)) continue;
      const kit = isBidir(n, g);
      ctx.findings.push(
        kit
          ? { id: `cat-kit-${n.id}-${g.family}`, level: "info", title: `Enlace ${g.family}: UTP entre las dos unidades del kit`, detail: `${n.label} trae las dos puntas de su enlace propietario: tender UTP entre la unidad local y la remota${g.maxLengthM ? ` (hasta ${g.maxLengthM} m según la ficha)` : ""}. No es HDBaseT ni red.` }
          : { id: `cat-peer-${n.id}-${g.family}`, level: "error", title: `Falta la otra punta del enlace ${g.family}`, detail: `${n.label} se conecta por un enlace UTP propietario (${g.family}) y solo empareja con un equipo de la misma familia: no sirve un HDBaseT ni un switch de red.` },
      );
    }
  }
}

/* ───────────── Audio: nivel y formato ───────────── */

const kindOf = (g: PortGroup): AudioKind => g.level ?? (g.signal === "digital" ? "digital" : "line");
const audioGroups = (n: Ready, side: "inputs" | "outputs") => n.ports[side].filter((g) => g.signal === "line" || g.signal === "digital");

export type AudioPair = { signal: "line" | "digital"; out: PortGroup; in: PortGroup | null };

/** Salida de audio de A que entra directo en una entrada de B (mismo nivel / formato). La sala técnica (virtual) recibe cualquiera. */
export function audioPair(a: Ready, b: Ready): AudioPair | null {
  const outs = audioGroups(a, "outputs");
  if (b.virtual) {
    const out = outs.find((g) => g.signal === "line") ?? outs[0];
    return out ? { signal: out.signal as "line" | "digital", out, in: null } : null;
  }
  for (const out of outs) {
    const input = audioGroups(b, "inputs").find((g) => audioFits(kindOf(out), kindOf(g)));
    if (input) return { signal: out.signal as "line" | "digital", out, in: input };
  }
  return null;
}

/** ¿A tiene salidas de audio y B entradas, pero no conectan directo? Devuelve el porqué. */
export function audioProblem(a: Ready, b: Ready): { text: string; fix: "audio-dac" | "dsp" | null } | null {
  const outs = audioGroups(a, "outputs");
  const ins = audioGroups(b, "inputs");
  if (!outs.length || !ins.length || audioPair(a, b)) return null;
  return audioMismatch(kindOf(outs[0]!), kindOf(ins[0]!));
}

export const hasAudioOut = (n: Ready) => audioGroups(n, "outputs").length > 0;

/** Conversor DAC de la sala (entrada digital, salida analógica) que todavía no se usa. */
function freeDac(ctx: LinkCtx): Ready | null {
  const used = new Set(ctx.links.filter((l) => l.signal === "digital").map((l) => l.to));
  return ctx.nodes.find((n) => !n.virtual && !used.has(n.id) && (n.cls === "other" || n.cls === "source") && portCount(n.ports, "inputs", "digital") > 0 && audioGroups(n, "outputs").some((g) => g.signal === "line") && portCount(n.ports, "outputs", "speaker") === 0) ?? null;
}

/**
 * Audio de una fuente a un equipo (amplificador, parlante activo): directo si el nivel y el
 * formato coinciden; con un DAC de la sala si la fuente es digital y la entrada analógica;
 * si no, avisa con la solución. Devuelve true si quedó conectado.
 */
export function feedAudio(ctx: LinkCtx, src: Ready, dst: Ready, toPort: string): boolean {
  const pair = audioPair(src, dst);
  if (pair) {
    ctx.add(src, dst, pair.signal, pair.signal === "digital" ? `Salida digital (${AUDIO_KIND_LABEL[kindOf(pair.out)]})` : "Salida de audio", pair.signal === "digital" ? "Entrada digital" : toPort);
    return true;
  }
  const problem = audioProblem(src, dst);
  if (!problem) return false;
  const digitalOut = audioGroups(src, "outputs").find((g) => g.signal === "digital");
  if (problem.fix === "audio-dac" && digitalOut) {
    const dac = freeDac(ctx);
    if (dac) {
      ctx.add(src, dac, "digital", `Salida digital (${AUDIO_KIND_LABEL[kindOf(digitalOut)]})`, "Entrada digital");
      ctx.add(dac, dst, "line", "Salida analógica", toPort);
      return true;
    }
  }
  ctx.findings.push({
    id: `audio-${src.id}-${dst.id}`,
    level: "error",
    title: problem.fix === "audio-dac" ? `Falta conversor DAC para ${dst.label}` : `Audio incompatible: ${src.label} → ${dst.label}`,
    detail: `${src.label} → ${dst.label}: ${problem.text}.`,
    ...(problem.fix === "audio-dac" ? { fix: { generic: "audio-dac", label: "Sumar conversor DAC (digital → analógico)", near: { x: dst.pos.x, z: dst.pos.z } } } : {}),
  });
  return false;
}

