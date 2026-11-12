/**
 * Motor de sistema: revisa que lo elegido funcione junto y explica por qué.
 *
 * - Amplificación: canales suficientes para los parlantes y zonas, potencia
 *   razonable, línea de 70/100 V.
 * - Control: cómo se integra cada equipo con Crestron Home / programado
 *   (reglas editables) y si hace falta red.
 * - Streaming: si se pidió y nadie lo resuelve.
 *
 * Es una función pura; la resolución de sugerencias a productos concretos
 * vive en system-check-db.ts.
 */

import type { RoomBrief } from "./brief";
import { findIntegration, METHOD_LABELS, PLATFORM_LABELS, type ControlPlatform, type IntegrationRule } from "./integrations";
import { HIGHZ_MAX_LOAD_RATIO, targetTapW, TYPICAL_MIN_LOAD_OHMS } from "./amp-load";
import { channelsNeeded, lineChannelsNeeded, TYPICAL_SPEAKER_OHMS, type SystemSpec } from "./system-specs";

export type CheckProduct = { id: string; name: string; brandSlug: string | null; brandName: string | null };

export type CheckDevice = {
  slotKey: string;
  role: string;
  label: string;
  quantity: number;
  product: CheckProduct | null;
  spec: SystemSpec | null;
};

export type FindingLevel = "ok" | "info" | "warn" | "error";

export type Suggestion =
  | { kind: "amplifier"; slotKey: string; minChannels: number; networked: boolean; currentProductId: string | null; sameQuantity: number | null }
  | { kind: "streamer" }
  | { kind: "switch" };

export type Finding = {
  id: string;
  level: FindingLevel;
  area: "audio" | "control" | "red" | "streaming";
  title: string;
  detail: string;
  /** Producto al que se refiere (para enlazar a su ficha o especificación). */
  productId?: string;
  suggestion?: Suggestion;
};

/** Potencia del amplificador vs. la del parlante: por debajo de esto queda corto. */
const UNDERPOWER_RATIO = 0.5;
const OVERPOWER_RATIO = 2.5;

const productLabel = (p: CheckProduct) => `${p.brandName ? `${p.brandName} ` : ""}${p.name}`.trim();

function controlPlatformOf(brief: RoomBrief | null): ControlPlatform | null {
  if (!brief || !brief.systems.includes("control")) return null;
  return brief.control === "crestron-home" || brief.control === "crestron-pro" ? brief.control : null;
}

function checkAudio(devices: CheckDevice[], brief: RoomBrief | null): Finding[] {
  const speakers = devices.filter((d) => d.role === "speaker" && d.product);
  const amps = devices.filter((d) => d.product && d.spec?.kind === "amplifier");
  const ampSlot = devices.find((d) => d.slotKey === "amplifier" || /amp/i.test(d.slotKey));
  const total = speakers.reduce((n, d) => n + d.quantity, 0);
  if (!total) return [];
  const zones = brief?.audio?.zones ?? 1;
  const speakerSpec = speakers.find((d) => d.spec)?.spec ?? null;
  const findings: Finding[] = [];
  // Carga real: impedancia en paralelo (baja impedancia) o suma de taps (70/100 V).
  const speakerLine = speakers.some((d) => d.spec?.highImpedance);
  const ohms = speakerSpec?.nominalOhms ?? null;
  const tapW = targetTapW(null).watts;
  const need = (amp: SystemSpec | null) =>
    speakerLine ? lineChannelsNeeded(total, zones, tapW, amp?.wattsPerChannel ?? null, HIGHZ_MAX_LOAD_RATIO) : channelsNeeded(total, zones, { minOhms: amp?.minOhms ?? TYPICAL_MIN_LOAD_OHMS }, ohms);
  const loadText = (perChannel: number, amp: SystemSpec | null) =>
    speakerLine
      ? `taps de ${tapW} W por parlante, hasta el ${Math.round(HIGHZ_MAX_LOAD_RATIO * 100)} % de cada canal`
      : `${perChannel} parlante${perChannel > 1 ? "s" : ""} de ${ohms ?? TYPICAL_SPEAKER_OHMS} Ω por canal = ${Math.round(((ohms ?? TYPICAL_SPEAKER_OHMS) / perChannel) * 10) / 10} Ω, el amplificador admite ${amp?.minOhms ?? TYPICAL_MIN_LOAD_OHMS} Ω`;

  if (!amps.length && brief?.centralized?.audio) {
    return [
      {
        id: "amp-central",
        level: "info",
        area: "audio",
        title: "Amplificación en el equipamiento central",
        detail: `${total} parlante${total > 1 ? "s" : ""} en ${zones} zona${zones > 1 ? "s" : ""}: se suman al sistema del proyecto (ver “Sistema del proyecto”).`,
      },
    ];
  }

  if (!amps.length) {
    const needed = need(null);
    findings.push(...estimatedFinding(audioEstimates(speakerLine, ohms, tapW, null)));
    findings.push({
      id: "amp-missing",
      level: "error",
      area: "audio",
      title: "Falta amplificación",
      detail: `${total} parlante${total > 1 ? "s" : ""} pasivo${total > 1 ? "s" : ""} necesitan un amplificador de al menos ${needed} canales.`,
      suggestion: {
        kind: "amplifier",
        slotKey: ampSlot?.slotKey ?? "amplifier",
        minChannels: needed,
        networked: Boolean(controlPlatformOf(brief)),
        currentProductId: null,
        sameQuantity: null,
      },
    });
    return findings;
  }

  const unknown = amps.filter((a) => a.spec?.channels == null);
  if (unknown.length) {
    for (const a of unknown) {
      findings.push({
        id: `amp-spec-${a.slotKey}`,
        level: "warn",
        area: "audio",
        title: `Faltan los canales de ${productLabel(a.product as CheckProduct)}`,
        detail: "Cargalos en Reglas del Room Builder → Especificaciones para poder calcular la amplificación.",
        productId: a.product?.id,
      });
    }
    return findings;
  }

  const ampSpec = amps[0].spec as SystemSpec;
  const needed = need(ampSpec);
  const available = amps.reduce((n, a) => n + (a.spec?.channels ?? 0) * a.quantity, 0);
  const main = amps[0];
  const perChannel = Math.ceil(total / Math.max(1, needed));
  findings.push(...estimatedFinding(audioEstimates(speakerLine, ohms, tapW, { spec: ampSpec, label: productLabel(main.product as CheckProduct) })));

  if (available < needed) {
    const missing = needed - available;
    const sameQty = Math.ceil(needed / (ampSpec.channels as number));
    findings.push({
      id: "amp-channels",
      level: "error",
      area: "audio",
      title: `${missing > 1 ? "Faltan" : "Falta"} ${missing} canal${missing > 1 ? "es" : ""} de amplificación`,
      detail: `${total} parlantes en ${zones} zona${zones > 1 ? "s" : ""} necesitan ${needed} canales (${loadText(perChannel, ampSpec)}); ${productLabel(main.product as CheckProduct)} da ${available}.`,
      productId: main.product?.id,
      suggestion: {
        kind: "amplifier",
        slotKey: main.slotKey,
        minChannels: needed,
        networked: Boolean(main.spec?.networked),
        currentProductId: main.product?.id ?? null,
        sameQuantity: sameQty,
      },
    });
  } else {
    findings.push({
      id: "amp-ok",
      level: "ok",
      area: "audio",
      title: "Amplificación suficiente",
      detail: `${available} canales para ${total} parlantes en ${zones} zona${zones > 1 ? "s" : ""} (${loadText(perChannel, ampSpec)}).`,
      productId: main.product?.id,
    });
  }

  const speakerWatts = speakerSpec?.wattsPerChannel ?? null;
  const ampWatts = ampSpec.wattsPerChannel;
  if (speakerWatts && ampWatts) {
    const perSpeaker = ampWatts / perChannel;
    if (perSpeaker < speakerWatts * UNDERPOWER_RATIO) {
      findings.push({
        id: "amp-underpowered",
        level: "warn",
        area: "audio",
        title: "Potencia justa",
        detail: `Cada parlante recibe ~${Math.round(perSpeaker)} W y admite ${speakerWatts} W: alcanza para música de fondo, se queda corto a volumen alto.`,
      });
    } else if (perSpeaker > speakerWatts * OVERPOWER_RATIO) {
      findings.push({
        id: "amp-overpowered",
        level: "info",
        area: "audio",
        title: "Amplificador sobrado",
        detail: `~${Math.round(perSpeaker)} W por parlante para ${speakerWatts} W admitidos: limitar el volumen máximo en el DSP.`,
      });
    }
  }

  const ampLine = amps.some((a) => a.spec?.highImpedance);
  if (speakerLine !== ampLine) {
    findings.push({
      id: "amp-line",
      level: "error",
      area: "audio",
      title: "Línea de 70/100 V incompatible",
      detail: speakerLine
        ? "Los parlantes son de línea de 70/100 V y el amplificador es de baja impedancia."
        : "El amplificador es de línea de 70/100 V y los parlantes son de baja impedancia.",
    });
  }
  return findings;
}

/**
 * Lo que el cálculo de amplificación tomó como típico porque no está en las especificaciones:
 * se usa para poder seguir, pero queda a la vista como "dato estimado".
 */
function audioEstimates(speakerLine: boolean, ohms: number | null, tapW: number, amp: { spec: SystemSpec; label: string } | null): string[] {
  const out: string[] = [];
  if (speakerLine) {
    out.push(`tap de ${tapW} W por parlante en la línea de 70/100 V (por defecto)`);
    if (amp && amp.spec.wattsPerChannel == null) out.push(`potencia por canal de ${amp.label}: falta el dato, no se verificó el ${Math.round(HIGHZ_MAX_LOAD_RATIO * 100)} % de la línea`);
    else if (amp) out.push(`potencia en línea de ${amp.label}: se toma ${amp.spec.wattsPerChannel} W por canal de la especificación`);
    return out;
  }
  if (ohms == null) out.push(`impedancia de los parlantes: ${TYPICAL_SPEAKER_OHMS} Ω típico (falta el dato)`);
  if (amp && amp.spec.minOhms == null) out.push(`carga mínima de ${amp.label}: ${TYPICAL_MIN_LOAD_OHMS} Ω típico (falta el dato)`);
  else if (amp && amp.spec.source === "auto") out.push(`carga mínima de ${amp.label}: ${amp.spec.minOhms} Ω supuesta por el modelo (cargala en Especificaciones)`);
  return out;
}

function estimatedFinding(estimates: string[]): Finding[] {
  if (!estimates.length) return [];
  return [{ id: "amp-estimated", level: "warn", area: "audio", title: "Amplificación con datos estimados", detail: `Sin verificar — ${estimates.map((e) => `dato estimado: ${e}`).join("; ")}.` }];
}

/** Equipos que se controlan (no los parlantes pasivos ni los muebles). */
const CONTROLLABLE = new Set(["processor", "display", "codec", "camera", "touch", "other"]);

function checkControl(devices: CheckDevice[], brief: RoomBrief | null, rules: IntegrationRule[]): Finding[] {
  const platform = controlPlatformOf(brief);
  if (!platform) return [];
  const platformName = PLATFORM_LABELS[platform];
  const findings: Finding[] = [];
  let needsNetwork = false;

  for (const d of devices) {
    if (!d.product || !CONTROLLABLE.has(d.role) || d.spec?.kind === "speaker") continue;
    const rule = findIntegration(rules, d.product.brandSlug, d.product.name, platform);
    const label = productLabel(d.product);
    if (!rule) {
      findings.push({
        id: `ctl-unknown-${d.slotKey}`,
        level: "warn",
        area: "control",
        title: `${label}: integración sin cargar`,
        detail: `No hay una regla de cómo se controla con ${platformName}. Cargala en Reglas del Room Builder.`,
        productId: d.product.id,
      });
      continue;
    }
    if (rule.needsNetwork) needsNetwork = true;
    if (rule.method === "none") {
      findings.push({
        id: `ctl-none-${d.slotKey}`,
        level: d.spec?.kind === "amplifier" ? "warn" : "info",
        area: "control",
        title: `${label} no se controla desde ${platformName}`,
        detail: [rule.requirement, rule.notes].filter(Boolean).join(" "),
        productId: d.product.id,
        suggestion:
          d.spec?.kind === "amplifier" && d.spec.channels
            ? { kind: "amplifier", slotKey: d.slotKey, minChannels: d.spec.channels * d.quantity, networked: true, currentProductId: d.product.id, sameQuantity: null }
            : undefined,
      });
      continue;
    }
    findings.push({
      id: `ctl-ok-${d.slotKey}`,
      level: "ok",
      area: "control",
      title: `${label} ↔ ${platformName}`,
      detail: `${METHOD_LABELS[rule.method]}. ${rule.requirement ?? ""}${rule.verified ? "" : " (regla a confirmar)"}`.trim(),
      productId: d.product.id,
    });
  }

  const hasSwitch = devices.some((d) => d.product && d.spec?.kind === "switch");
  if (needsNetwork && !hasSwitch) {
    findings.push({
      id: "net-switch",
      level: "info",
      area: "red",
      title: "Red para el control",
      detail: "Hay equipos que se integran por red: sumá un switch (idealmente PoE) si la obra no tiene uno dedicado.",
      suggestion: { kind: "switch" },
    });
  }
  return findings;
}

function checkStreaming(devices: CheckDevice[], brief: RoomBrief | null): Finding[] {
  if (!brief?.audio?.streaming || !brief.systems.includes("audio")) return [];
  const solved = devices.some((d) => d.product && d.spec?.streaming);
  if (solved) {
    return [{ id: "stream-ok", level: "ok", area: "streaming", title: "Streaming resuelto", detail: "Un equipo elegido reproduce música por red." }];
  }
  return [
    {
      id: "stream-missing",
      level: "warn",
      area: "streaming",
      title: "Falta la fuente de streaming",
      detail: "Pediste música por streaming y ningún equipo elegido la reproduce: sumá un reproductor de red.",
      suggestion: { kind: "streamer" },
    },
  ];
}

const LEVEL_ORDER: Record<FindingLevel, number> = { error: 0, warn: 1, info: 2, ok: 3 };

export function runSystemCheck(devices: CheckDevice[], brief: RoomBrief | null, rules: IntegrationRule[]): Finding[] {
  return [...checkAudio(devices, brief), ...checkStreaming(devices, brief), ...checkControl(devices, brief, rules)].sort(
    (a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level],
  );
}
