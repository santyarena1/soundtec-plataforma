/**
 * Parlantes de la escena como fuentes del mapa de sonido: posición real de
 * cada unidad, montaje, datos de ficha (sensibilidad, cobertura, taps,
 * potencia) y la potencia que le llega según la amplificación calculada
 * (amp-assign: tap en 70/100 V o parte del canal en baja impedancia).
 * Lo que falta en la ficha se completa con un típico y queda como estimado.
 */

import { chooseTap, parseLoadKey, pickLineVolts, speakerLineVolts, targetTapW, productLabel, type LineVolts } from "../amp-load";
import type { ChannelLoad } from "../amp-assign";
import type { CablingProfile } from "../cabling-db";
import type { DevicePorts } from "../device-ports";
import type { RoomScene } from "../scene";
import { layoutSceneDevices, sceneDims } from "../units";
import { floorOf } from "../wiring/plan-geometry";
import { computeSoundMap, type SoundMapResult } from "./sound-map";
import { resolveAcoustics, type ResolvedAcoustics } from "./settings";
import { ceilingAxes, TYPICAL_CEILING_COVERAGE, TYPICAL_SENSITIVITY_DB, wallAxes, type SoundSource } from "./source";
import { polygonAreaPerimeter } from "./reverb";

/** Alto típico de una ventana para pasar el ancho del plano a m² de vidrio (m). */
const WINDOW_HEIGHT_M = 1.4;
/** Inclinación hacia abajo de un parlante de pared cuando no se conoce (°). */
const WALL_TILT_DEG = 10;

const fmt = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

type SpeakerDevice = RoomScene["devices"][number];

/** ¿Es un parlante de rango completo (no subwoofer) para el mapa? */
function isMapSpeaker(d: SpeakerDevice, profile: CablingProfile | null): boolean {
  const cls = profile?.devices[d.id]?.cls;
  if (cls === "subwoofer") return false;
  if (cls === "speaker") return true;
  return d.designRole === "speaker" && !/sub(woofer)?\b/i.test(`${d.slotKey} ${d.productName ?? ""}`);
}

/** Potencia del amplificador a la carga del canal (la potencia de ficha a la carga más cercana). */
function ampWattsAt(ports: DevicePorts | null | undefined, ohms: number): number | null {
  const rated = Object.entries(ports?.ampWattsPerChannel ?? {})
    .map(([k, w]) => ({ key: parseLoadKey(k), w: Number(w) }))
    .filter((r): r is { key: { ohms: number }; w: number } => Boolean(r.key && "ohms" in r.key) && r.w > 0)
    .sort((a, b) => Math.abs(a.key.ohms - ohms) - Math.abs(b.key.ohms - ohms));
  return rated[0]?.w ?? null;
}

function ampPorts(ampId: string, profile: CablingProfile | null): DevicePorts | null {
  const base = ampId.split("#")[0]!;
  if (base.startsWith("central:")) return profile?.centralDevices?.find((c) => `central:${c.key}` === base)?.ports ?? null;
  return profile?.devices[base]?.ports ?? null;
}

/** Potencia que recibe una unidad de parlante y los datos estimados para llegar a ella. */
export function speakerWatts(
  nodeId: string,
  ports: DevicePorts | null,
  label: string,
  amplification: ChannelLoad[] | null | undefined,
  profile: CablingProfile | null,
  opts: { category: string; tapW: number | null },
): { watts: number; estimates: string[]; volts: LineVolts | null } {
  const continuous = ports?.speakerPowerWatts?.continuous ?? ports?.speakerPowerWatts?.program ?? null;
  const ch = amplification?.find((c) => c.speakerIds.includes(nodeId));
  if (ch && ch.mode === "high") {
    const tap = ch.taps[ch.speakerIds.indexOf(nodeId)];
    if (tap != null && tap > 0) return { watts: tap, volts: ch.volts, estimates: opts.tapW ? [] : [`tap de ${label}: ${fmt(tap)} W por defecto del tipo de sala (fijalo o aplicá la grilla sugerida)`] };
  }
  if (ch && ch.mode === "low") {
    const z = ports?.impedanceOhms ?? 8;
    const load = ch.loadOhms ?? z;
    const pCh = ampWattsAt(ampPorts(ch.ampId, profile), load);
    const est: string[] = [`potencia de ${label}: parte de su canal en baja impedancia a plena potencia (es el máximo; el volumen real lo fija el operador)`];
    if (pCh == null) return { watts: continuous ?? 10, volts: null, estimates: [...est, `potencia del amplificador a ${fmt(load)} Ω no declarada: se usa ${continuous != null ? "la continua del parlante" : "10 W"}`] };
    const share = (pCh * load) / z;
    return { watts: continuous != null ? Math.min(share, continuous) : share, volts: null, estimates: est };
  }
  // Sin canal asignado (parlante activo, sin amplificador o sin ficha): tap o potencia de la ficha.
  if (ports?.transformerTaps && speakerLineVolts(ports).some((v) => (ports.transformerTaps?.[v] ?? []).length)) {
    const volts = pickLineVolts({ inputs: [], outputs: [], network: 0, lineVoltage: "both" }, ports) ?? "70V";
    const t = chooseTap(ports, volts, targetTapW(opts.category, opts.tapW), label);
    return { watts: t.watts, volts, estimates: [`${label} sin canal de amplificación asignado: se toma el tap de ${fmt(t.watts)} W en ${volts}`] };
  }
  // Sin canal ni taps: potencia de diseño típica del tipo de sala (la continua de la ficha es un máximo, no un nivel de uso).
  const typical = targetTapW(opts.category, opts.tapW).watts;
  const watts = continuous != null ? Math.min(continuous, typical) : typical;
  return { watts, volts: null, estimates: [`${label}: sin canal de amplificación asignado, se calcula a ${fmt(watts)} W por parlante (potencia de diseño típica${continuous != null ? `; admite ${fmt(continuous)} W continuos` : ", sin potencia en la ficha"})`] };
}

/** Fuentes del mapa: una por unidad de parlante, en su lugar de la escena. */
export function sceneSources(scene: RoomScene, category: string, profile: CablingProfile | null, amplification: ChannelLoad[] | null | undefined, settings: ResolvedAcoustics): SoundSource[] {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const laid = layoutSceneDevices(scene.devices, slots, dims);
  const out: SoundSource[] = [];
  for (const [i, d] of scene.devices.entries()) {
    if (!isMapSpeaker(d, profile)) continue;
    if (!d.productId && !d.generic) continue;
    const info = profile?.devices[d.id];
    const ports = info?.ports ?? null;
    const label = productLabel(info?.label ?? d.productName ?? d.label);
    const mount = slots.get(d.slotKey)?.mount ?? "ceiling";
    const est: string[] = [];
    const sensitivity = ports?.sensitivityDb ?? null;
    if (sensitivity == null) est.push(`sensibilidad de ${label}: ${TYPICAL_SENSITIVITY_DB} dB (1 W/1 m) típica (la ficha no la declara)`);
    let coverage = ports?.coverageDeg ?? null;
    if (!coverage || !(coverage.horizontal > 0)) {
      const typical = mount === "ceiling" ? { horizontal: TYPICAL_CEILING_COVERAGE, vertical: TYPICAL_CEILING_COVERAGE } : { horizontal: 90, vertical: 60 };
      est.push(`cobertura de ${label}: ${typical.horizontal}°×${typical.vertical}° típica de un parlante ${mount === "ceiling" ? "de techo" : "de pared"} (la ficha no la declara)`);
      coverage = typical;
    } else if (!(coverage.vertical > 0)) coverage = { horizontal: coverage.horizontal, vertical: coverage.horizontal };
    const units = laid[i]!.device.units ?? [];
    units.forEach((u, k) => {
      const nodeId = `${d.id}#${k}`;
      const power = speakerWatts(nodeId, ports, label, amplification, profile, { category, tapW: settings.tapW });
      let axes = ceilingAxes(u.pose.rotY);
      if (mount !== "ceiling") {
        // Pared / piso: apunta hacia la altura de oído en el centro de la sala (inclinación estimada si no se puede).
        const toCenter = Math.hypot(u.pose.x, u.pose.z);
        const tilt = toCenter > 0.5 ? Math.max(0, Math.min(35, (Math.atan2(u.pose.y - settings.earM, toCenter) * 180) / Math.PI)) : WALL_TILT_DEG;
        axes = wallAxes(u.pose.rotY, tilt);
        if (k === 0) est.push(`${label}: apuntado estimado hacia el centro de la sala (${Math.round(tilt)}° hacia abajo)`);
      }
      out.push({
        id: nodeId,
        label: units.length > 1 ? `${label} (${k + 1})` : label,
        deviceId: d.id,
        pos: { x: u.pose.x, y: u.pose.y, z: u.pose.z },
        ...axes,
        coverage,
        sensitivityDb: sensitivity ?? TYPICAL_SENSITIVITY_DB,
        watts: power.watts,
        estimates: [...est, ...power.estimates],
      });
    });
  }
  return out;
}

/** Vidrio de las ventanas dibujadas en el plano (m²), o null si no hay. */
export function planGlassM2(scene: RoomScene): number | null {
  const windows = scene.plan?.enabled ? (scene.plan.openings ?? []).filter((o) => o.kind === "window") : [];
  if (!windows.length) return null;
  return windows.reduce((s, o) => s + Math.max(0, o.to - o.from), 0) * WINDOW_HEIGHT_M;
}

/** Mapa de sonido completo de la escena (lo usan el editor en vivo y la lámina PDF). */
export function sceneSoundMap(scene: RoomScene, category: string, profile: CablingProfile | null, amplification: ChannelLoad[] | null | undefined): SoundMapResult {
  const floor = floorOf(scene);
  const settings = resolveAcoustics(category, scene.acoustics, polygonAreaPerimeter(floor).area);
  const sources = sceneSources(scene, category, profile, amplification, settings);
  const glass = planGlassM2(scene);
  const result = computeSoundMap({ floor, heightM: scene.heightM, glassM2: glass, sources, settings });
  if (glass != null) result.estimates.push(`vidrio: ventanas del plano con ${fmt(WINDOW_HEIGHT_M)} m de alto típico`);
  return result;
}
