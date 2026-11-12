/**
 * Alcance de cada señal sin extensor, con criterio de integrador: el largo
 * máximo de un cable depende de lo que viaja por él (resolución y ancho de
 * banda del HDMI, versión de USB, HDBaseT estándar o de largo alcance) y de
 * lo que declaran las fichas de las DOS puntas. Lo usan el motor automático
 * (cabling.ts), el plano técnico (wiring/validate.ts) y la lista de cables
 * (cotización: cable óptico/activo en tramos largos).
 *
 * Valores (cobre pasivo, cable certificado):
 *   HDMI 8K / 48 Gbps ≈ 3 m · 4K60 / 18 Gbps ≈ 5 m (aviso desde 4 m) ·
 *   4K30 / 10,2 Gbps ≈ 7,5 m · 1080p ≈ 15 m
 *   USB 2.0 = 5 m · USB 3.x ≈ 3 m
 *   HDBaseT 4K ≈ 70 m (estándar en Cat6) · 100 m en 1080p o con la versión/cable que
 *   lo declare (HDBaseT 3.0 / Cat6A / "up to 100 m" en la ficha)
 *   Ethernet / Dante = 100 m · enlace propietario: lo que diga la ficha.
 */

import { UTP_MAX_M } from "./cable-length";

export type VideoClass = "8k" | "4k60" | "4k30" | "1080p";
export type UsbClass = "usb2" | "usb3";

/** Lo que dice la ficha de una punta del cable. */
export type ReachEnd = {
  maxVideo?: string | null;
  hdcp?: string | null;
  usbVersion?: string | null;
  /** Largo máximo declarado para el puerto que usa el cable (m). */
  portMaxM?: number | null;
  /** Rótulo / cita del puerto (para reconocer HDBaseT 3.0 o "100 m"). */
  portText?: string | null;
};

/** Familia de alcance de una señal (de ficha o del motor). */
export type ReachKind = "hdmi" | "usb" | "hdbaset" | "utp" | "cat" | "displayport" | "vga" | "rs232" | "sdi";

export function reachKind(signal: string): ReachKind | null {
  if (signal === "hdmi") return "hdmi";
  if (signal === "usb" || signal.startsWith("usb-")) return "usb";
  if (signal === "hdbaset") return "hdbaset";
  if (signal === "lan" || signal === "dante") return "utp";
  if (signal === "cat" || signal === "cat-proprietary") return "cat";
  if (signal === "displayport" || signal === "vga" || signal === "rs232" || signal === "sdi") return signal;
  return null;
}

export const HDMI_PASSIVE: Record<VideoClass, { maxM: number; warnFromM: number; label: string }> = {
  "8k": { maxM: 3, warnFromM: 3, label: "8K / 48 Gbps" },
  "4k60": { maxM: 5, warnFromM: 4, label: "4K60 (18 Gbps)" },
  "4k30": { maxM: 7.5, warnFromM: 7.5, label: "4K30 (10,2 Gbps)" },
  "1080p": { maxM: 15, warnFromM: 15, label: "1080p" },
};
export const USB_PASSIVE: Record<UsbClass, { maxM: number; label: string }> = { usb2: { maxM: 5, label: "USB 2.0" }, usb3: { maxM: 3, label: "USB 3.x" } };
/** HDBaseT estándar en Cat6 con video 4K. */
export const HDBASET_4K_M = 70;
/** HDBaseT en 1080p, o 4K con la versión/cable que lo admite. */
export const HDBASET_LONG_M = 100;
/** Largos fijos de otras señales (m). */
const FIXED: Partial<Record<ReachKind, number>> = { displayport: 5, vga: 15, rs232: 15, sdi: 100 };

const RANK: Record<VideoClass, number> = { "1080p": 0, "4k30": 1, "4k60": 2, "8k": 3 };

/** Resolución que pide una ficha ("4K60 4:4:4", "8K", "1080p", "4K UHD @ 30Hz"); null si no se reconoce. */
export function videoClassOf(text: string | null | undefined): VideoClass | null {
  const t = (text ?? "").toLowerCase();
  if (!t.trim()) return null;
  if (/\b8k\b|48\s*gbps|4k\s*@?\s*1[02]0|hdmi\s*2\.1|\bfrl\b/.test(t)) return "8k";
  // El cuadro va pegado a "hz"/"p" ("4K UHD @ 30Hz"): se corta en el próximo dígito, no en \b.
  if (/(4k|2160p?)[^0-9]{0,12}(60|50)(?!\d)|18\s*gbps|hdmi\s*2\.0|\b4k60\b/.test(t)) return "4k60";
  if (/(4k|2160p?)[^0-9]{0,12}(30|25|24)(?!\d)|10\.2\s*gbps|hdmi\s*1\.4|\b4k30\b/.test(t)) return "4k30";
  // 4K sin cuadro declarado: se toma 60 Hz (lo exigente).
  if (/\b4k\b|\buhd\b|2160|3840/.test(t)) return "4k60";
  if (/1080|1920|full\s*hd|\bfhd\b|1200p|wuxga|720p/.test(t)) return "1080p";
  return null;
}

/** Tope de video que impone la versión HDCP cuando la ficha no da resolución (HDCP 1.x = HDMI 1.4). */
function hdcpCap(hdcp: string | null | undefined): VideoClass | null {
  return hdcp && /^\s*1(\.\d)?\s*$/.test(hdcp) ? "4k30" : null;
}

/**
 * Lo que viaja por el cable entre dos puntas: el menor de lo que declaran (una pantalla
 * 1080p no recibe 4K). Sin dato en ninguna ficha se asume 4K60 (lo habitual hoy).
 */
export function linkVideoClass(a: ReachEnd, b: ReachEnd): { cls: VideoClass; assumed: boolean } {
  const known = [a, b].map((e) => videoClassOf(e.maxVideo) ?? hdcpCap(e.hdcp)).filter((c): c is VideoClass => c != null);
  if (!known.length) return { cls: "4k60", assumed: true };
  return { cls: known.sort((x, y) => RANK[x] - RANK[y])[0]!, assumed: false };
}

export function usbClassOf(text: string | null | undefined): UsbClass | null {
  const t = (text ?? "").toLowerCase();
  if (/usb\s*3|\b3\.[012]\b|superspeed|\b(5|10|20)\s*gbps|gen\s*[12]/.test(t)) return "usb3";
  if (/usb\s*[12]\b|\b2\.0\b|\b1\.1\b|high[- ]?speed|480\s*mbps|full[- ]?speed/.test(t)) return "usb2";
  return null;
}

/** USB del enlace: si una punta es 2.0 el enlace va en 2.0; 3.x solo si alguna lo declara. Sin dato: 2.0. */
export function linkUsbClass(a: ReachEnd, b: ReachEnd): { cls: UsbClass; assumed: boolean } {
  const known = [usbClassOf(a.usbVersion), usbClassOf(b.usbVersion)].filter((c): c is UsbClass => c != null);
  if (!known.length) return { cls: "usb2", assumed: true };
  return { cls: known.includes("usb2") ? "usb2" : "usb3", assumed: false };
}

const LONG_HDBASET = /hdbaset\s*3\.0|hdbaset\s*2\.0[^.]{0,20}100|100\s*m\b|328\s*(ft|feet|')|330\s*(ft|feet|')|cat\s*6a|long[- ]reach/i;

/** Largo máximo declarado por las puntas (el menor manda). */
function declaredMax(a: ReachEnd, b: ReachEnd): number | null {
  const list = [a.portMaxM, b.portMaxM].filter((m): m is number => typeof m === "number" && m > 0);
  return list.length ? Math.min(...list) : null;
}

/**
 * Alcance del cable: largo máximo, desde dónde avisar, si pasarse es error (UTP: no se
 * arregla con otro cable) y el porqué en palabras ("HDMI 4K60 (18 Gbps)").
 */
export type Reach = { kind: ReachKind; maxM: number; warnFromM: number; hard: boolean; basis: string; assumed: boolean; video?: VideoClass; usb?: UsbClass };

export function reachFor(signal: string, a: ReachEnd = {}, b: ReachEnd = {}): Reach | null {
  const kind = reachKind(signal);
  if (!kind) return null;
  if (kind === "hdmi") {
    const v = linkVideoClass(a, b);
    const r = HDMI_PASSIVE[v.cls];
    return { kind, maxM: r.maxM, warnFromM: r.warnFromM, hard: false, basis: `HDMI pasivo a ${r.label}${v.assumed ? " (resolución sin dato en la ficha: se toma 4K60)" : ""}`, assumed: v.assumed, video: v.cls };
  }
  if (kind === "usb") {
    const u = linkUsbClass(a, b);
    const r = USB_PASSIVE[u.cls];
    return { kind, maxM: r.maxM, warnFromM: r.maxM, hard: false, basis: `${r.label} pasivo${u.assumed ? " (versión sin dato en la ficha: se toma USB 2.0)" : ""}`, assumed: u.assumed, usb: u.cls };
  }
  if (kind === "hdbaset") {
    const declared = declaredMax(a, b);
    if (declared) return { kind, maxM: declared, warnFromM: declared, hard: true, basis: `HDBaseT: ${declared} m según la ficha`, assumed: false };
    const v = linkVideoClass(a, b);
    const long = [a.portText, b.portText].some((t) => t && LONG_HDBASET.test(t));
    if (long || v.cls === "1080p") return { kind, maxM: HDBASET_LONG_M, warnFromM: HDBASET_LONG_M, hard: true, basis: long ? "HDBaseT de largo alcance (según la ficha)" : "HDBaseT en 1080p", assumed: false, video: v.cls };
    return { kind, maxM: HDBASET_4K_M, warnFromM: HDBASET_4K_M, hard: true, basis: `HDBaseT estándar con video ${HDMI_PASSIVE[v.cls].label} en Cat6`, assumed: v.assumed, video: v.cls };
  }
  if (kind === "utp") return { kind, maxM: UTP_MAX_M, warnFromM: UTP_MAX_M, hard: true, basis: "canal UTP (Ethernet / Dante)", assumed: false };
  if (kind === "cat") {
    const declared = declaredMax(a, b);
    return declared ? { kind, maxM: declared, warnFromM: declared, hard: true, basis: `enlace propietario: ${declared} m según la ficha`, assumed: false } : null;
  }
  const fixed = FIXED[kind];
  return fixed ? { kind, maxM: fixed, warnFromM: fixed, hard: false, basis: kind.toUpperCase(), assumed: false } : null;
}

/** Productos del catálogo que resuelven un tramo largo (nombres para sugerirlos). */
export type ReachCatalog = {
  /** HDMI óptico activo (AOC): el más largo que hay. */
  hdmiAoc?: { name: string; lengthM: number | null } | null;
  /** USB activo (con repetidor) o extensor USB por UTP. */
  usbActive?: { name: string; lengthM: number | null } | null;
  usbExtender?: { name: string } | null;
  /** Extensor HDBaseT: transmisor y receptor. */
  hdbasetTx?: { name: string } | null;
  hdbasetRx?: { name: string } | null;
};

/** Largo hasta el que un HDMI óptico activo (AOC) es la solución práctica; más, extensor por UTP. */
const AOC_PRACTICAL_M = 30;
/** USB activo (cable con repetidor) práctico; más, extensor USB por UTP. */
const USB_ACTIVE_M = 15;
/** Extensor USB 2.0 por UTP (Cat5e/6). */
const USB_UTP_M = 50;

export type Remedy = { text: string };

const named = (p: { name: string } | null | undefined, generic: string) => (p ? `${p.name} (del catálogo)` : `${generic} (genérico: no hay en el catálogo)`);

/** Solución concreta para un tramo que se pasa del alcance (texto para el aviso y el genérico a sumar). */
export function remedyFor(reach: Reach, lengthM: number, catalog: ReachCatalog = {}): Remedy {
  switch (reach.kind) {
    case "hdmi": {
      const aoc = catalog.hdmiAoc && (catalog.hdmiAoc.lengthM == null || catalog.hdmiAoc.lengthM >= lengthM) ? catalog.hdmiAoc : null;
      if (lengthM <= AOC_PRACTICAL_M) {
        return { text: `usar HDMI óptico activo (AOC) de ${lengthM} m: ${named(aoc, "HDMI AOC")}; o un extensor HDBaseT (transmisor + receptor) por UTP.` };
      }
      return { text: `${lengthM} m es largo aun para un AOC: extensor HDBaseT por UTP — transmisor ${named(catalog.hdbasetTx, "HDBaseT TX")} junto a la fuente y receptor ${named(catalog.hdbasetRx, "HDBaseT RX")} junto a la pantalla.` };
    }
    case "usb": {
      if (reach.usb === "usb3" && lengthM > USB_ACTIVE_M) return { text: `USB 3.x a ${lengthM} m: extensor USB 3 por fibra o acercar el equipo (la cámara/PC) al otro extremo.` };
      if (lengthM <= USB_ACTIVE_M) return { text: `usar cable USB activo (con repetidor) de ${lengthM} m: ${named(catalog.usbActive, "USB activo")}; o un extensor USB por UTP: ${named(catalog.usbExtender, "extensor USB")}.` };
      return { text: `extensor USB por UTP (hasta ${USB_UTP_M} m en USB 2.0): ${named(catalog.usbExtender, "extensor USB por UTP")}.` };
    }
    case "hdbaset":
      return { text: `pasa el alcance de ${reach.basis}: usar cable Cat6A con un extensor HDBaseT de largo alcance (100 m) o un enlace por fibra; o acercar el receptor.` };
    case "utp":
      return { text: "supera el canal UTP de 100 m: hace falta un switch intermedio o fibra." };
    case "cat":
      return { text: `pasa el largo del ${reach.basis}: acercar emisor y receptor o pasar a un extensor de mayor alcance.` };
    default:
      return { text: "usar un extensor de esa señal o acercar los equipos." };
  }
}
