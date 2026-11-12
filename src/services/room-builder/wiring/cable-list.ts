/**
 * LA lista de cables de un ambiente. De acá salen la cotización, la pestaña
 * Cableado, el plano técnico, la planilla del proyecto y las láminas, así
 * todos dicen los mismos cables y los mismos metros:
 *
 * - si el ambiente tiene cableado guardado en el plano técnico (lo trazó el
 *   sistema con "Resolver y trazar" o el usuario a mano), ese;
 * - si no, la propuesta automática ya convertida en cables de puerto a puerto
 *   (los mismos que se guardarían), con el mismo cálculo de largo.
 *
 * Cada cable lleva señal, puertos, largo final (cable-length.ts), si el largo
 * es medido o estimado y el cable del catálogo elegido a mano (si hay).
 * Es puro (sin base): lo usan el editor en vivo y el servidor.
 */

import type { CableLink, CablingPlan } from "../cabling";
import { autoNotInManual, nodeDevice, physicalFamily } from "../sheets/sheet-model";
import type { CablingProfile } from "../cabling-db";
import { cablingForScene } from "../cabling-scene";
import type { CableNeed } from "../cable-picks";
import type { Signal } from "../device-ports";
import type { IoSignal } from "../io-profile/types";
import type { RoomScene } from "../scene";
import { autoWires, buildWiringModel, wiringOf, type ModelWire, type RackTrunk, type WiringModel } from "./model";
import { WIRE_SIGNAL_STYLE, type SceneWiring } from "./types";
import { MAX_RUN_M } from "./validate";

export type RoomCable = ModelWire & {
  fromName: string;
  fromPort: string;
  toName: string;
  toPort: string;
  /** Nombre de la señal como se muestra ("HDMI", "Red / LAN"…) y su color. */
  signalLabel: string;
  /**
   * Parlantes que alimenta este tramo (solo cables de parlante): la carga que
   * define su calibre. El cableado es en estrella (un tramo por parlante hasta
   * el canal), así que es el propio parlante de la punta de entrada.
   */
  feeds: Array<{ deviceId: string; unit: number }>;
  color: string;
};

export type RoomCableList = {
  /** manual: cableado guardado del plano técnico; auto: propuesta automática; none: sin cables. */
  source: "manual" | "auto" | "none";
  plan: CablingPlan | null;
  model: WiringModel;
  cables: RoomCable[];
  /** Cables del plan que faltaban en el cableado guardado y se sumaron (a confirmar en el plano técnico). */
  added?: number;
};

export type CableTotal = { label: string; color: string; count: number; meters: number };

/** Cables del ambiente (ver encabezado). `trunk`: tramo de la salida al rack central, si el ambiente baja a uno. */
export function roomCableList(scene: RoomScene, category: string, profile: CablingProfile | null, trunk: RackTrunk | null = null): RoomCableList {
  const plan = profile ? cablingForScene(scene, category, profile) : null;
  const saved = wiringOf(scene);
  if (saved.wires.length) {
    // Cables del plan que faltan en el guardado (ej. los de la mesa y el switch nuevo que el conversor
    // viejo descartaba): se suman marcados, salvo los que el usuario borró a mano.
    const missing = plan ? missingFromSaved(plan, saved) : [];
    const wiring = missing.length ? completeSaved(plan!, missing, scene, profile, saved) : saved;
    const model = buildWiringModel({ ...scene, wiring }, profile, { trunk, category });
    const added = new Set(wiring.wires.filter((w) => !saved.wires.some((s) => s.id === w.id)).map((w) => w.id));
    for (const id of added) model.issues.push({ wireId: id, level: "warn", text: "Cable propuesto por el sistema que falta en el plano técnico: abrí el plano técnico para confirmarlo (se cotiza igual)." });
    return { source: "manual", plan, model, cables: describe(model), added: added.size };
  }
  if (!plan) {
    const model = buildWiringModel(scene, profile, { trunk, category });
    return { source: "none", plan, model, cables: [] };
  }
  // La propuesta automática pasa por el mismo conversor que "Resolver y trazar": mismos cables, mismos largos.
  const base = buildWiringModel(scene, profile);
  const wiring = autoWires(plan, base, saved);
  const model = buildWiringModel({ ...scene, wiring }, profile, { trunk, category });
  return { source: wiring.wires.length ? "auto" : "none", plan, model, cables: describe(model) };
}

/** Enlaces del plan sin cable equivalente en el guardado (mismos equipos y familia), descontando los borrados a mano. */
function missingFromSaved(plan: CablingPlan, saved: SceneWiring): CableLink[] {
  const links = plan.links.filter((l) => l.signal !== "wireless");
  const have: Array<{ a: string; b: string; family: string }> = [
    ...saved.wires.map((w) => ({ a: w.from.deviceId, b: w.to.deviceId, family: physicalFamily(w.signal) })),
    ...(saved.dismissed ?? []).map((k) => {
      const [a = "", b = "", family = ""] = k.split("|");
      return { a, b, family };
    }),
  ];
  return autoNotInManual(
    links.map((l) => ({ a: nodeDevice(l.from), b: nodeDevice(l.to), family: physicalFamily(l.signal) })),
    have,
  ).map((i) => links[i]!);
}

/** El guardado + los cables que faltan, convertidos de puerto a puerto sin tocar lo guardado. */
function completeSaved(plan: CablingPlan, missing: CableLink[], scene: RoomScene, profile: CablingProfile | null, saved: SceneWiring): SceneWiring {
  const fixed: SceneWiring = { ...saved, dismissed: [], wires: saved.wires.map((w) => ({ ...w, origin: "manual" as const })) };
  const out = autoWires(plan, buildWiringModel(scene, profile), fixed, { only: new Set(missing.map((l) => l.id)) });
  const origin = new Map(saved.wires.map((w) => [w.id, w.origin]));
  return { ...out, dismissed: saved.dismissed, wires: out.wires.map((w) => ({ ...w, origin: origin.get(w.id) ?? "auto" })) };
}

function describe(model: WiringModel): RoomCable[] {
  const placed = new Map(model.devices.map((d) => [`${d.deviceId}#${d.unit}`, d]));
  const units = (id: string) => model.devices.filter((d) => d.deviceId === id).length;
  const name = (id: string, unit: number) => {
    const d = placed.get(`${id}#${unit}`);
    return d ? `${d.short}${units(id) > 1 ? ` (${unit + 1})` : ""}` : id;
  };
  const port = (id: string, portId: string) => model.ports[id]?.find((p) => p.id === portId)?.label ?? portId;
  const portDir = (id: string, portId: string) => model.ports[id]?.find((p) => p.id === portId)?.direction ?? null;
  // Punta que recibe (el parlante): la de puerto de entrada; si no se sabe, el destino del cable.
  const feeds = (w: ModelWire) => {
    if (w.signal !== "speaker") return [];
    const end = portDir(w.from.deviceId, w.from.portId) === "in" && portDir(w.to.deviceId, w.to.portId) !== "in" ? w.from : w.to;
    return [{ deviceId: end.deviceId, unit: end.unit }];
  };
  return model.wires.map((w) => ({
    ...w,
    fromName: name(w.from.deviceId, w.from.unit),
    fromPort: port(w.from.deviceId, w.from.portId),
    toName: name(w.to.deviceId, w.to.unit),
    toPort: port(w.to.deviceId, w.to.portId),
    signalLabel: WIRE_SIGNAL_STYLE[w.signal].label,
    feeds: feeds(w),
    color: WIRE_SIGNAL_STYLE[w.signal].color,
  }));
}

/** Cables y metros por señal (lo que muestran la pestaña Cableado, el plano técnico y la planilla). */
export function cableTotals(cables: Array<Pick<ModelWire, "signal" | "lengthM">>): CableTotal[] {
  const by = new Map<string, CableTotal>();
  for (const c of cables) {
    const style = WIRE_SIGNAL_STYLE[c.signal];
    const row = by.get(style.label) ?? { label: style.label, color: style.color, count: 0, meters: 0 };
    row.count++;
    row.meters = Math.round((row.meters + c.lengthM) * 10) / 10;
    by.set(style.label, row);
  }
  return [...by.values()].sort((a, b) => b.meters - a.meters);
}

/** Señal de ficha → tipo de cable del motor (para elegir el producto del catálogo). */
const IO_TO_ENGINE: Partial<Record<IoSignal, Signal>> = {
  hdmi: "hdmi",
  "usb-a": "usb",
  "usb-b": "usb",
  "usb-c": "usb",
  lan: "lan",
  dante: "dante",
  hdbaset: "hdbaset",
  speaker: "speaker",
  "analog-audio": "line",
  mic: "line",
  "digital-audio": "line",
  rs232: "rs232",
  ir: "ir",
};

/**
 * Lo que hay que comprar: cada cable con su largo final. Las señales sin cable
 * equivalente en el catálogo (DisplayPort, Cresnet, fibra…) se devuelven aparte
 * para informarlas, no se inventa un producto.
 */
export function cableNeeds(cables: Array<Pick<ModelWire, "signal" | "lengthM" | "cableProductId">>): { needs: CableNeed[]; unmapped: CableTotal[] } {
  const needs: CableNeed[] = [];
  const other: Array<Pick<ModelWire, "signal" | "lengthM">> = [];
  for (const c of cables) {
    const signal = IO_TO_ENGINE[c.signal];
    if (!signal) {
      other.push(c);
      continue;
    }
    const max = MAX_RUN_M[c.signal];
    needs.push({ signal, cableM: c.lengthM, long: max != null && c.lengthM > max, productId: c.cableProductId });
  }
  return { needs, unmapped: cableTotals(other) };
}
