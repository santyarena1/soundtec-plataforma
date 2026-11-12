/**
 * Carga de cada salida de parlante en el cableado hecho a mano: una salida de
 * amplificador admite varios parlantes, pero no cualquier cantidad. En baja
 * impedancia, el paralelo no puede bajar de la carga mínima; en 70/100 V, la
 * suma de taps no pasa del 80 % de la potencia; y nunca se mezclan los dos
 * modos en la misma salida. Lo que falta en la ficha queda como aviso.
 */

import { ampLineCapacity, ampMinLoad, chooseTap, HIGHZ_MAX_LOAD_RATIO, lineModes, parallelOhms, pickLineVolts, productLabel, speakerOhms, targetTapW, type SpeakerMode } from "../amp-load";
import type { DevicePorts } from "../device-ports";
import type { Wire, WirePort } from "./types";
import type { WireIssue } from "./validate";

/** Datos eléctricos de un equipo del plano (de su ficha); null si no tiene ficha leída. */
export type ElectricalOf = (deviceId: string) => { label: string; ports: DevicePorts | null } | null;
export type SpeakerLoadOptions = { category?: string | null; tapW?: number | null };

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
const isOut = (p: WirePort) => p.direction === "out" || p.direction === "bidir";

type Group = { ampId: string; port: WirePort; wires: string[]; speakers: string[] };

/** Agrupa los cables de parlante por salida del amplificador (equipo + unidad + puerto). */
function groupsOf(wires: Wire[], portsOf: (deviceId: string) => WirePort[] | null): Group[] {
  const groups = new Map<string, Group>();
  for (const w of wires) {
    const a = portsOf(w.from.deviceId)?.find((p) => p.id === w.from.portId);
    const b = portsOf(w.to.deviceId)?.find((p) => p.id === w.to.portId);
    if (!a || !b || a.signal !== "speaker" || b.signal !== "speaker") continue;
    // La punta de salida es el amplificador; si las dos dicen "bidir", manda el sentido del cable.
    const [out, port, spk] = isOut(a) && b.direction !== "out" ? [w.from, a, w.to] : isOut(b) && a.direction !== "out" ? [w.to, b, w.from] : [null, null, null];
    if (!out || !port || !spk) continue;
    const key = `${out.deviceId}#${out.unit}#${out.portId}`;
    const g = groups.get(key) ?? { ampId: out.deviceId, port, wires: [], speakers: [] };
    g.wires.push(w.id);
    g.speakers.push(spk.deviceId);
    groups.set(key, g);
  }
  return [...groups.values()];
}

/** Revisión de carga de todas las salidas de parlante cableadas a mano. */
export function speakerLoadIssues(wires: Wire[], portsOf: (deviceId: string) => WirePort[] | null, electricalOf: ElectricalOf, opts: SpeakerLoadOptions = {}): WireIssue[] {
  const issues: WireIssue[] = [];
  const target = targetTapW(opts.category, opts.tapW);
  for (const g of groupsOf(wires, portsOf)) {
    const amp = electricalOf(g.ampId);
    const errorAll = (text: string) => g.wires.forEach((id) => issues.push({ wireId: id, level: "error", text }));
    const warn = (text: string) => issues.push({ wireId: g.wires[0]!, level: "warn", text });
    if (!amp?.ports) {
      if (g.speakers.length > 1) warn(`Dato estimado en ${g.port.label}: ${amp?.label ?? "el amplificador"} no tiene ficha leída, no se verificó la carga de ${g.speakers.length} parlantes.`);
      continue;
    }
    const spks = g.speakers.map((id) => electricalOf(id) ?? { label: id, ports: null });
    const noSheet = spks.filter((s) => !s.ports).map((s) => s.label);
    // Modo de la salida: el que imponen los parlantes; los de doble modo siguen al resto (o a la línea, como el motor).
    const forced = new Set(spks.flatMap((s) => (s.ports && s.ports.lineVoltage !== "both" ? lineModes(s.ports.lineVoltage) : s.ports ? [] : ["low" as const])));
    if (forced.size > 1) {
      errorAll(`${g.port.label}: mezcla parlantes de baja impedancia y de línea de 70/100 V en la misma salida. Separalos en salidas distintas.`);
      continue;
    }
    const ampModes = lineModes(amp.ports.lineVoltage);
    const mode: SpeakerMode = [...forced][0] ?? (ampModes.includes("high") ? "high" : "low");
    if (!ampModes.includes(mode)) {
      errorAll(`${g.port.label}: ${amp.label} ${mode === "low" ? "trabaja en línea de 70/100 V y los parlantes son de baja impedancia" : "es de baja impedancia y los parlantes son de línea de 70/100 V"}.`);
      continue;
    }
    const estimates: string[] = noSheet.length ? [`${noSheet.join(", ")} sin ficha leída`] : [];
    if (mode === "low") {
      const min = ampMinLoad(amp.ports, amp.label);
      const zs = spks.map((s) => (s.ports ? speakerOhms(s.ports, productLabel(s.label)) : { ohms: 8, estimate: null }));
      const load = parallelOhms(zs.map((z) => z.ohms));
      if (load < min.ohms - 1e-9) errorAll(`${g.port.label}: ${g.speakers.length} parlantes en paralelo dan ${fmt(load)} Ω y ${amp.label} admite ${fmt(min.ohms)} Ω como mínimo. Pasá parlantes a otra salida.`);
      for (const e of [min.estimate, ...zs.map((z) => z.estimate)]) if (e && !estimates.includes(e.text)) estimates.push(e.text);
    } else {
      const volts = pickLineVolts(amp.ports, spks.find((s) => s.ports)?.ports ?? amp.ports) ?? "70V";
      const cap = ampLineCapacity(amp.ports, volts, amp.label);
      const taps = spks.map((s) => (s.ports ? chooseTap(s.ports, volts, target, productLabel(s.label)) : { watts: target.watts, estimate: null }));
      const total = taps.reduce((n, t) => n + t.watts, 0);
      if (cap.watts != null && total > cap.watts * HIGHZ_MAX_LOAD_RATIO + 1e-9) {
        errorAll(`${g.port.label}: ${g.speakers.length} parlantes suman ${fmt(total)} W en ${volts} y la salida da ${cap.watts} W (máximo ${Math.round(HIGHZ_MAX_LOAD_RATIO * 100)} %: ${fmt(cap.watts * HIGHZ_MAX_LOAD_RATIO)} W). Bajá el tap o partí la línea.`);
      }
      if (cap.bridged) warn(`${g.port.label}: ${amp.label} da ${volts} solo puenteado; esta línea ocupa dos canales.`);
      for (const e of [cap.estimate, ...taps.map((t) => t.estimate)]) if (e && e.kind === "missing" && !estimates.includes(e.text)) estimates.push(e.text);
    }
    if (estimates.length) warn(`Dato estimado en ${g.port.label}: ${estimates.join("; ")}.`);
  }
  return issues;
}
