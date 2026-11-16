/**
 * Grilla sugerida ↔ escena: arma el parlante de la grilla con los datos de la
 * ficha del modelo elegido y aplica la propuesta a la escena (reubica y
 * agrega/quita unidades de ese parlante en el techo y fija el tap). El reparto
 * en amplificadores lo vuelve a hacer amp-assign con la cantidad y el tap
 * nuevos: no se toca el cableado a mano.
 */

import type { ChannelLoad } from "../amp-assign";
import { productLabel, speakerLineVolts, type LineVolts } from "../amp-load";
import type { CablingProfile } from "../cabling-db";
import type { RoomScene, SceneDevice } from "../scene";
import type { DeviceUnit } from "../units";
import type { GridProposal, GridSpeaker } from "./grid-design";
import { TYPICAL_CEILING_COVERAGE, TYPICAL_SENSITIVITY_DB } from "./source";

const CEILING_DROP_M = 0.05;

/** Parlantes de la escena que pueden recibir la grilla (de techo, con producto o genérico). */
export function ceilingSpeakers(scene: RoomScene, profile: CablingProfile | null): SceneDevice[] {
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  return scene.devices.filter((d) => {
    if (!d.productId && !d.generic) return false;
    const cls = profile?.devices[d.id]?.cls;
    const isSpeaker = cls ? cls === "speaker" : d.designRole === "speaker";
    return isSpeaker && (slots.get(d.slotKey)?.mount ?? "ceiling") === "ceiling";
  });
}

/** Datos del modelo para el diseñador de grilla (lo que falta, típico y marcado). */
export function gridSpeakerFor(device: SceneDevice, profile: CablingProfile | null, amplification: ChannelLoad[] | null | undefined): GridSpeaker {
  const info = profile?.devices[device.id];
  const ports = info?.ports ?? null;
  const label = productLabel(info?.label ?? device.productName ?? device.label);
  const estimates: string[] = [];
  const sens = ports?.sensitivityDb ?? null;
  if (sens == null) estimates.push(`sensibilidad de ${label}: ${TYPICAL_SENSITIVITY_DB} dB típica`);
  const cov = ports?.coverageDeg;
  const coverage = cov && cov.horizontal > 0 ? Math.min(cov.horizontal, cov.vertical > 0 ? cov.vertical : cov.horizontal) : null;
  if (coverage == null) estimates.push(`cobertura de ${label}: ${TYPICAL_CEILING_COVERAGE}° típica de techo`);
  // Tensión de la línea: la del canal ya asignado; si no, 70 V si el transformador la tiene.
  const assigned = amplification?.find((c) => c.mode === "high" && c.speakerIds.some((id) => id.startsWith(`${device.id}#`)))?.volts ?? null;
  const own = ports ? speakerLineVolts(ports).filter((v) => (ports.transformerTaps?.[v] ?? []).length) : [];
  const volts: LineVolts | null = assigned && own.includes(assigned) ? assigned : (own[0] ?? null);
  return {
    label,
    sensitivityDb: sens ?? TYPICAL_SENSITIVITY_DB,
    coverageDeg: coverage ?? TYPICAL_CEILING_COVERAGE,
    taps: volts ? [...(ports?.transformerTaps?.[volts] ?? [])] : [],
    volts,
    continuousW: ports?.speakerPowerWatts?.continuous ?? ports?.speakerPowerWatts?.program ?? null,
    estimates,
  };
}

/** Escena con la grilla aplicada al parlante elegido (unidades ubicadas a mano en el techo) y el tap fijado. */
export function applyGridToScene(scene: RoomScene, deviceId: string, proposal: GridProposal): RoomScene {
  const y = Math.round((scene.heightM - CEILING_DROP_M) * 100) / 100;
  return {
    ...scene,
    devices: scene.devices.map((d) => {
      if (d.id !== deviceId) return d;
      const units: DeviceUnit[] = proposal.positions.map((p, i) => ({ id: `${d.slotKey}#${i}`, pose: { x: p.x, y, z: p.y, rotY: 0 }, placed: true }));
      return { ...d, quantity: units.length, units, pose: units[0]!.pose };
    }),
    acoustics: { ...(scene.acoustics ?? {}), tapW: proposal.tapW ?? scene.acoustics?.tapW ?? null },
  };
}
