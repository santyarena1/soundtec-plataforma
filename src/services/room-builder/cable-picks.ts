/**
 * Cables del catálogo para un cableado: cada cable armado (HDMI, USB) con el
 * largo estándar que alcanza; los de rollo (UTP, parlante, audio) sumando
 * metros y redondeando a bobinas. Lo que el catálogo no tiene se informa como
 * faltante: no se inventa un producto.
 */

import type { CablingPlan } from "./cabling";
import type { Signal } from "./device-ports";

export type CableProduct = {
  id: string;
  name: string;
  brand: string | null;
  /** Señal que lleva (UTP agrupa red, Dante y HDBaseT). */
  signal: "hdmi" | "usb" | "utp" | "speaker" | "line" | "rs232";
  /** patch = cable armado de un largo; bulk = rollo/bobina. */
  kind: "patch" | "bulk";
  /** Largo del cable armado o de la bobina (m); null si se vende por metro. */
  lengthM: number | null;
  /** HDMI óptico (AOC) o USB activo: para tramos largos. */
  extended: boolean;
  priceUsd: number | null;
};

export type CablePickLine = { product: CableProduct; quantity: number; signal: Signal; meters: number; note: string };
export type CableMissing = { signal: Signal; count: number; meters: number; reason: string };

const BULK_GROUP: Partial<Record<Signal, CableProduct["signal"]>> = { lan: "utp", dante: "utp", hdbaset: "utp", speaker: "speaker", line: "line", rs232: "rs232" };
const PATCH: Signal[] = ["hdmi", "usb"];

/** Elige los cables del catálogo para el cableado. */
export function pickCables(plan: CablingPlan, catalog: CableProduct[]): { lines: CablePickLine[]; missing: CableMissing[] } {
  const lines: CablePickLine[] = [];
  const missing: CableMissing[] = [];
  const addLine = (product: CableProduct, quantity: number, signal: Signal, meters: number, note: string) => {
    const hit = lines.find((l) => l.product.id === product.id);
    if (hit) {
      hit.quantity += quantity;
      hit.meters += meters;
    } else lines.push({ product, quantity, signal, meters, note });
  };

  // Cables armados: uno por conexión, el más corto que alcance (óptico/activo en tramos largos).
  for (const signal of PATCH) {
    const links = plan.links.filter((l) => l.signal === signal);
    for (const l of links) {
      const long = Boolean(l.note);
      const options = catalog
        .filter((c) => c.signal === signal && c.kind === "patch" && c.lengthM != null && c.lengthM >= l.cableM && (!long || c.extended))
        .sort((a, b) => (a.lengthM ?? 0) - (b.lengthM ?? 0) || (a.priceUsd ?? 1e9) - (b.priceUsd ?? 1e9));
      const pick = options[0];
      if (pick) addLine(pick, 1, signal, l.cableM, `${signal.toUpperCase()} ${pick.lengthM} m`);
      else {
        const m = missing.find((x) => x.signal === signal);
        if (m) {
          m.count++;
          m.meters += l.cableM;
        } else missing.push({ signal, count: 1, meters: l.cableM, reason: long ? "No hay en el catálogo un cable óptico/activo de ese largo" : "No hay en el catálogo un cable de ese largo" });
      }
    }
  }

  // Rollos: se suman los metros por tipo de cable.
  const bulk = new Map<CableProduct["signal"], { meters: number; count: number; signals: Set<Signal> }>();
  for (const l of plan.links) {
    const group = BULK_GROUP[l.signal];
    if (!group) continue;
    const b = bulk.get(group) ?? { meters: 0, count: 0, signals: new Set<Signal>() };
    b.meters += l.cableM;
    b.count++;
    b.signals.add(l.signal);
    bulk.set(group, b);
  }
  for (const [group, b] of bulk) {
    const signal = [...b.signals][0]!;
    const reels = catalog.filter((c) => c.signal === group && c.kind === "bulk").sort((a, c) => (a.priceUsd ?? 1e9) - (c.priceUsd ?? 1e9));
    const reel = reels.find((c) => c.lengthM != null) ?? reels[0];
    if (!reel) {
      missing.push({ signal, count: b.count, meters: Math.round(b.meters), reason: "No hay rollo de este cable en el catálogo" });
      continue;
    }
    const qty = reel.lengthM ? Math.ceil(b.meters / reel.lengthM) : Math.ceil(b.meters);
    addLine(reel, qty, signal, Math.round(b.meters), reel.lengthM ? `${Math.round(b.meters)} m en ${qty} bobina(s) de ${reel.lengthM} m` : `${Math.ceil(b.meters)} m`);
  }
  return { lines, missing };
}

/** Lee del nombre/ficha de un cable su tipo y largo (null si no es un cable reconocible). */
export function classifyCable(input: { id: string; name: string; brand: string | null; text: string; priceUsd: number | null }): CableProduct | null {
  const t = `${input.name} ${input.text}`.toLowerCase();
  let signal: CableProduct["signal"] | null = null;
  if (/hdmi/.test(t)) signal = "hdmi";
  else if (/\busb\b|usb-?c/.test(t)) signal = "usb";
  else if (/cat ?6a?|cat ?5e|\butp\b|ethernet|rj-?45|\blan\b cable|dm cable|hdbaset/.test(t)) signal = "utp";
  else if (/speaker|parlante|altavoz|\b1[246] ?awg\b/.test(t)) signal = "speaker";
  else if (/rs-?232|db-?9|serial/.test(t)) signal = "rs232";
  else if (/xlr|balanced audio|audio cable|cable de audio|microphone cable|mic cable/.test(t)) signal = "line";
  if (!signal) return null;
  const bulkWord = /reel|spool|bobina|rollo|\bbox\b|caja|1000 ?ft|500 ?ft|305 ?m|152 ?m|100 ?m roll|por metro|bulk/.test(t);
  const kind: CableProduct["kind"] = signal === "hdmi" || signal === "usb" ? "patch" : bulkWord ? "bulk" : "patch";
  return { id: input.id, name: input.name, brand: input.brand, signal, kind, lengthM: lengthOf(t), extended: /optic|óptic|aoc|fiber|fibra|active|activo|extender/.test(t), priceUsd: input.priceUsd };
}

/** Largo en metros: "10 m", "3 metros", "33 ft", "1000'". */
export function lengthOf(text: string): number | null {
  const m = text.match(/(\d+(?:[.,]\d+)?)\s*(?:m|mts|metros?|meters?)\b/);
  if (m) return Number(m[1]!.replace(",", "."));
  const ft = text.match(/(\d+(?:[.,]\d+)?)\s*(?:ft|feet|pies|')(?![a-z])/);
  if (ft) return Math.round(Number(ft[1]!.replace(",", ".")) * 0.3048 * 10) / 10;
  return null;
}
