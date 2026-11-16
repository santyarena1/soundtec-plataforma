/**
 * Vista frontal del rack (elevación) con consumo y calor. Lógica pura, sin base:
 * la usan la pestaña "Rack" de la vista técnica (en el navegador, para
 * reordenar al instante) y la lámina "Rack" del PDF.
 *
 * Reglas:
 * - Alto en U de la ficha (Product.rackUnits). Sin dato: si el equipo tiene el
 *   ancho de 19" (≥ 40 cm), se deduce de su alto (1U = 4,445 cm, hacia arriba)
 *   y queda marcado estimado. Equipos de escritorio (más angostos o sin
 *   medidas) van en bandeja; los de media unidad, de a dos en un kit.
 * - Orden lógico de arriba hacia abajo: red (switch), procesamiento y
 *   control, fuentes/reproductores, amplificadores abajo (peso y calor) y la
 *   PDU en la última unidad. El orden se puede cambiar a mano (rackOrder).
 * - 1U de panel ventilado arriba de cada amplificador.
 * - Rack comercial (6, 9, 12, 16, 20, 24, 32, 42 U) con al menos 20 % libre; el
 *   espacio libre va con tapas ciegas, arriba de los amplificadores.
 */

import type { DeviceClass } from "../device-ports";
import { BTU_PER_W, CONTINUOUS_LOAD, devicePower, MAINS_V, pduFor, POWER_KIND_LABEL, round1, ventilationFor, type DevicePower, type SpecRow, type Ventilation } from "./rack-power";

/** 1U = 1,75" = 4,445 cm. */
export const U_CM = 4.445;
/** Tamaños comerciales de rack (U). */
export const RACK_SIZES = [6, 9, 12, 16, 20, 24, 32, 42] as const;
/** Reserva mínima de espacio libre en el rack. */
export const RACK_RESERVE = 0.2;
/** Ancho de un equipo de 19" sin orejas (cm): desde acá se considera de rack. */
const RACK_WIDTH_CM = 40;
/** Hasta este ancho (cm) un equipo de 1U es de media unidad (dos por kit). */
const HALF_WIDTH_CM = 25;
/** Ancho útil de una bandeja de 19" (cm). */
const SHELF_WIDTH_CM = 43;
/** Ancho supuesto de un equipo de escritorio sin medidas (cm, estimado). */
const SHELF_ITEM_WIDTH_CM = 20;
/** Espesor de bandeja + aire sobre el equipo (cm). */
const SHELF_CLEARANCE_CM = 1.5;
/** Alto supuesto de un equipo de escritorio sin medidas (U, estimado). */
const SHELF_DEFAULT_U = 2;
/** Holgura detrás del equipo más profundo para cables y fichas (cm). */
const DEPTH_CLEARANCE_CM = 10;
/** Profundidades útiles comerciales (cm). */
const RACK_DEPTHS = [45, 60, 80, 100] as const;

export type RackZone = "network" | "control" | "sources" | "amps" | "power";

export const ZONE_LABEL: Record<RackZone, string> = {
  network: "Red",
  control: "Procesamiento y control",
  sources: "Fuentes y reproductores",
  amps: "Amplificación",
  power: "Energía",
};

const ZONE_ORDER: RackZone[] = ["network", "control", "sources", "amps", "power"];

/** Zona del rack por tipo de equipo; dentro de cada zona, el orden de la lista. */
const ZONE_OF: Partial<Record<DeviceClass, RackZone>> = {
  switch: "network",
  control: "control",
  codec: "control",
  dsp: "control",
  "video-switch": "control",
  streamer: "sources",
  source: "sources",
  other: "sources",
  amp: "amps",
};
const CLASS_RANK: DeviceClass[] = ["switch", "control", "codec", "dsp", "video-switch", "streamer", "source", "other", "amp"];

/** Tipos de equipo que nunca van al rack (se montan en la sala). */
export const NOT_IN_RACK = new Set<DeviceClass>(["display", "camera", "mic", "speaker", "subwoofer", "touch"]);

export type RackItemInput = {
  /** deviceId#unidad: cada unidad física es un equipo en el rack. */
  key: string;
  deviceId: string;
  unit: number;
  name: string;
  brand: string | null;
  cls: DeviceClass;
  /** Alto en U de la ficha (null = sin dato). */
  rackUnits: number | null;
  sizeCm: { w: number | null; h: number | null; d: number | null } | null;
  weightKg: number | null;
  specs: SpecRow[] | null;
  /** Amplificador: potencia total de salida (W) para estimar el consumo. */
  ampTotalW: number | null;
  /** PoE: lo alimenta el switch (pd) y cuánto consume; presupuesto del switch (pse). */
  poe: { pd: boolean; watts: number | null; estimated: boolean } | null;
  poeBudgetW: number | null;
};

/** Equipo fuera del rack alimentado por PoE desde el switch de este rack. */
export type PoeLoad = { name: string; watts: number; estimated: boolean };

export type RackInput = {
  id: string;
  title: string;
  /** room: rack de un ambiente; central: rack central del proyecto. */
  scope: "room" | "central";
  items: RackItemInput[];
  poeLoads: PoeLoad[];
  /** Orden guardado a mano (claves de bloque, de arriba hacia abajo). */
  order: string[] | null;
  notes?: string[];
};

/** Cómo entra un equipo al rack. */
export type RackFit = { mode: "rack" | "half" | "shelf"; u: number; estimated: boolean; note: string | null };

const pos = (n: number | null | undefined) => (n != null && Number.isFinite(n) && n > 0 ? n : null);
const fmt1 = (n: number) => String(round1(n)).replace(".", ",");

/** Alto en U desde el alto en cm (hacia arriba; tolera las patas de goma, que se sacan al montar). */
export const unitsFromCm = (cm: number) => Math.max(1, Math.ceil(cm / U_CM - 0.05));

/** Sin ninguna medida: amplificadores y switches se suponen de 19" (son de rack casi siempre), con su alto típico. */
const TYPICAL_RACK_U: Partial<Record<DeviceClass, number>> = { amp: 2, switch: 1 };

export function rackFit(item: Pick<RackItemInput, "rackUnits" | "sizeCm"> & { cls?: DeviceClass }): RackFit {
  const w = pos(item.sizeCm?.w);
  const h = pos(item.sizeCm?.h);
  const ru = pos(item.rackUnits);
  if (ru) {
    if (w && w <= HALF_WIDTH_CM) return { mode: "half", u: ru, estimated: false, note: "Media unidad: va de a dos en kit de montaje" };
    return { mode: "rack", u: ru, estimated: false, note: null };
  }
  if (w && w >= RACK_WIDTH_CM && h) return { mode: "rack", u: unitsFromCm(h), estimated: true, note: `Alto en U deducido de la ficha (${fmt1(h)} cm)` };
  const typical = item.cls ? TYPICAL_RACK_U[item.cls] : undefined;
  if (typical && !w && !h) return { mode: "rack", u: typical, estimated: true, note: `Sin medidas en la ficha: ${typical}U típico de su tipo, estimado` };
  if (h) return { mode: "shelf", u: unitsFromCm(h + SHELF_CLEARANCE_CM), estimated: false, note: "Equipo de escritorio: va en bandeja" };
  return { mode: "shelf", u: SHELF_DEFAULT_U, estimated: true, note: "Sin medidas en la ficha: bandeja de 2U estimada" };
}

export type RackBlockKind = "equipment" | "half" | "shelf" | "vent" | "blank" | "pdu";

/** watts: lo que toma de la PDU (con el PoE sumado en el switch; 0 si lo alimenta el switch). */
export type RackBlockItem = { key: string; name: string; brand: string | null; power: DevicePower | null; poeFed: boolean; watts?: number };

export type RackBlock = {
  key: string;
  kind: RackBlockKind;
  zone: RackZone | null;
  label: string;
  u: number;
  /** U de arriba y de abajo (U1 = la de abajo del rack). */
  top: number;
  bottom: number;
  estimated: boolean;
  note: string | null;
  items: RackBlockItem[];
  /** Se puede mover a mano (equipos, bandejas y kits). */
  movable: boolean;
};

export type RackPowerRow = {
  key: string;
  name: string;
  brand: string | null;
  u: string;
  watts: number;
  kind: "ficha" | "ficha-calor" | "estimado" | "poe";
  note: string | null;
  heatBtu: number;
};

export type RackPower = {
  rows: RackPowerRow[];
  /** Consumo total en la PDU (W), con las cargas PoE incluidas en el switch. */
  totalW: number;
  /** Parte del total que es estimada (W). */
  estimatedW: number;
  amps: number;
  outlets: number;
  /** Cargas PoE fuera del rack (W) y presupuesto PoE de los switches (W, null sin dato). */
  poeOutsideW: number;
  poeInRackW: number;
  poeBudgetW: number | null;
  /** Calor dentro del rack (BTU/h y W): consumo menos lo que sale por PoE a equipos de la sala. */
  heatBtu: number;
  heatW: number;
  pdu: ReturnType<typeof pduFor>;
  ventilation: Ventilation;
};

export type RackModel = {
  id: string;
  title: string;
  scope: "room" | "central";
  empty: boolean;
  sizeU: number;
  usedU: number;
  freeU: number;
  /** Libre / total (0..1). */
  reserve: number;
  /** Profundidad útil sugerida (cm), si hay medidas. */
  depthCm: number | null;
  weightKg: number;
  weightEstimated: boolean;
  blocks: RackBlock[];
  power: RackPower;
  warnings: string[];
  /** Aclaraciones del rack (ej. el PoE de la sala sale del rack central). */
  info: string[];
  /** Criterios usados (van en la lámina). */
  notes: string[];
  /** Claves de los bloques movibles en el orden final (para guardar al reordenar). */
  order: string[];
};

/** Switch que da PoE: presupuesto PoE en la ficha o "PoE" en el nombre. */
export const isPoeSwitch = (i: Pick<RackItemInput, "cls" | "poeBudgetW" | "name">) => i.cls === "switch" && ((i.poeBudgetW ?? 0) > 0 || /poe/i.test(i.name));

const zoneOf = (cls: DeviceClass): RackZone => ZONE_OF[cls] ?? "sources";
const rankOf = (cls: DeviceClass) => {
  const i = CLASS_RANK.indexOf(cls);
  return i < 0 ? CLASS_RANK.length : i;
};
const fullName = (i: { brand: string | null; name: string }) => [i.brand, i.name].filter(Boolean).join(" ");

/** Rack comercial con al menos 20 % libre; null si no entra en uno de 42U. */
export function suggestRackSize(usedU: number): number | null {
  if (usedU <= 0) return RACK_SIZES[0];
  return RACK_SIZES.find((s) => usedU <= s * (1 - RACK_RESERVE)) ?? null;
}

/**
 * Orden final: el guardado a mano manda; los bloques nuevos (que no estaban
 * cuando se guardó) entran en su lugar lógico, antes del primer bloque
 * guardado que en el orden lógico va después que ellos.
 */
export function mergeOrder(logical: string[], saved: string[] | null | undefined): string[] {
  if (!saved?.length) return logical;
  const exists = new Set(logical);
  const out = saved.filter((k, i) => exists.has(k) && saved.indexOf(k) === i);
  const rank = new Map(logical.map((k, i) => [k, i]));
  for (const k of logical) {
    if (out.includes(k)) continue;
    const r = rank.get(k)!;
    const at = out.findIndex((x) => (rank.get(x) ?? 0) > r);
    if (at < 0) out.push(k);
    else out.splice(at, 0, k);
  }
  return out;
}

type Movable = Omit<RackBlock, "top" | "bottom">;

/** Bloques movibles en orden lógico: equipos, kits de media unidad y bandejas por zona. */
function logicalBlocks(items: RackItemInput[], itemOf: (i: RackItemInput) => RackBlockItem): Movable[] {
  const sorted = [...items].sort((a, b) => ZONE_ORDER.indexOf(zoneOf(a.cls)) - ZONE_ORDER.indexOf(zoneOf(b.cls)) || rankOf(a.cls) - rankOf(b.cls) || a.name.localeCompare(b.name) || a.unit - b.unit);
  const blocks: Movable[] = [];
  for (const zone of ZONE_ORDER) {
    const inZone = sorted.filter((i) => zoneOf(i.cls) === zone);
    const fits = new Map(inZone.map((i) => [i.key, rackFit(i)]));
    // Amplificadores: los más pesados / altos más abajo.
    const rackItems = inZone.filter((i) => fits.get(i.key)!.mode === "rack");
    if (zone === "amps") rackItems.sort((a, b) => fits.get(a.key)!.u - fits.get(b.key)!.u || (a.weightKg ?? 0) - (b.weightKg ?? 0));
    for (const i of rackItems) {
      const f = fits.get(i.key)!;
      blocks.push({ key: i.key, kind: "equipment", zone, label: fullName(i), u: f.u, estimated: f.estimated, note: f.note, items: [itemOf(i)], movable: true });
    }
    // Media unidad: de a dos por kit, del mismo alto.
    const halves = inZone.filter((i) => fits.get(i.key)!.mode === "half");
    const byU = new Map<number, RackItemInput[]>();
    for (const i of halves) byU.set(fits.get(i.key)!.u, [...(byU.get(fits.get(i.key)!.u) ?? []), i]);
    for (const [u, list] of byU) {
      for (let k = 0; k < list.length; k += 2) {
        const pair = list.slice(k, k + 2);
        blocks.push({ key: `half:${pair.map((p) => p.key).join("+")}`, kind: "half", zone, label: `Kit de media unidad ${u}U`, u, estimated: false, note: pair.length < 2 ? "Media unidad libre en el kit" : null, items: pair.map(itemOf), movable: true });
      }
    }
    // Escritorio: bandejas de 19" llenas por ancho; el alto es el del equipo más alto.
    const desk = inZone.filter((i) => fits.get(i.key)!.mode === "shelf");
    const shelves: Array<{ items: RackItemInput[]; width: number }> = [];
    for (const i of desk) {
      const w = pos(i.sizeCm?.w) ?? SHELF_ITEM_WIDTH_CM;
      const shelf = shelves.find((s) => s.width + w <= SHELF_WIDTH_CM);
      if (shelf) {
        shelf.items.push(i);
        shelf.width += w;
      } else shelves.push({ items: [i], width: w });
    }
    shelves.forEach((s, n) => {
      const u = Math.max(...s.items.map((i) => fits.get(i.key)!.u));
      const estimated = s.items.some((i) => fits.get(i.key)!.estimated || !pos(i.sizeCm?.w));
      blocks.push({ key: `shelf:${zone}:${n + 1}`, kind: "shelf", zone, label: `Bandeja ${u}U`, u, estimated, note: estimated ? "Medidas de algún equipo estimadas" : null, items: s.items.map(itemOf), movable: true });
    });
  }
  return blocks;
}

export function buildRack(input: RackInput): RackModel {
  const items = input.items.filter((i) => !NOT_IN_RACK.has(i.cls));
  const warnings: string[] = [];
  const notes: string[] = [];

  // PoE: switches que dan PoE (presupuesto en la ficha o "PoE" en el nombre).
  const pse = items.filter(isPoeSwitch);
  const hasPse = pse.length > 0;
  const powers = new Map(items.map((i) => [i.key, devicePower({ cls: i.cls, specs: i.specs, ampTotalW: i.ampTotalW })]));
  const poeFed = (i: RackItemInput) => hasPse && Boolean(i.poe?.pd) && i.cls !== "switch";
  const itemOf = (i: RackItemInput): RackBlockItem => ({ key: i.key, name: i.name, brand: i.brand, power: powers.get(i.key) ?? null, poeFed: poeFed(i) });

  const movable = logicalBlocks(items, itemOf);
  const logical = movable.map((b) => b.key);
  const order = mergeOrder(logical, input.order);
  const byKey = new Map(movable.map((b) => [b.key, b]));
  const ordered = order.map((k) => byKey.get(k)!).filter(Boolean);

  // Secuencia de arriba hacia abajo: panel ventilado sobre cada amplificador y la PDU al fondo.
  const seq: Movable[] = [];
  for (const b of ordered) {
    const isAmp = b.items.some((it) => items.find((x) => x.key === it.key)?.cls === "amp");
    if (isAmp && seq[seq.length - 1]?.kind !== "vent") seq.push({ key: `vent:${b.key}`, kind: "vent", zone: "amps", label: "Panel ventilado 1U", u: 1, estimated: false, note: "1U libre arriba del amplificador", items: [], movable: false });
    seq.push(b);
  }
  if (items.length) seq.push({ key: "pdu", kind: "pdu", zone: "power", label: "PDU (tomas)", u: 1, estimated: false, note: null, items: [], movable: false });

  const usedU = seq.reduce((a, b) => a + b.u, 0);
  const suggested = suggestRackSize(usedU);
  if (!suggested) warnings.push(`Los equipos ocupan ${usedU}U: no entran en un rack de 42U con reserva; dividir en ${Math.ceil(usedU / (42 * (1 - RACK_RESERVE)))} racks.`);
  // Sin equipos de rack no hay rack que sugerir.
  const sizeU = items.length ? (suggested ?? Math.max(42, usedU)) : 0;
  const freeU = Math.max(0, sizeU - usedU);
  // El espacio libre (tapas ciegas) va arriba de la amplificación: aire para el calor y lugar para crecer.
  if (freeU > 0) {
    const firstAmp = seq.findIndex((b) => b.zone === "amps");
    const at = firstAmp >= 0 ? firstAmp : seq.length - (items.length ? 1 : 0);
    const n2 = Math.floor(freeU / 2);
    const n1 = freeU % 2;
    const blanks = [n2 ? `${n2} × 2U` : null, n1 ? `${n1} × 1U` : null].filter(Boolean).join(" + ");
    seq.splice(at, 0, { key: "blank", kind: "blank", zone: null, label: `Reserva ${freeU}U (tapas ciegas)`, u: freeU, estimated: false, note: `Tapas ciegas ${blanks}`, items: [], movable: false });
  }
  let top = sizeU;
  const blocks: RackBlock[] = seq.map((b) => {
    const block = { ...b, top, bottom: top - b.u + 1 };
    top -= b.u;
    return block;
  });

  // Energía: cada equipo con su toma; los alimentados por PoE suman en el switch.
  const rows: RackPowerRow[] = [];
  const uOf = new Map<string, string>();
  for (const b of blocks) for (const it of b.items) uOf.set(it.key, b.kind === "equipment" ? `${b.u}U${b.estimated ? " ≈" : ""}` : `${b.kind === "shelf" ? "bandeja" : "½"} ${b.u}U`);
  let poeInRack = 0;
  for (const i of items) {
    const p = powers.get(i.key)!;
    if (poeFed(i)) {
      const w = i.poe?.watts ?? p.watts;
      poeInRack += w;
      rows.push({ key: i.key, name: i.name, brand: i.brand, u: uOf.get(i.key) ?? "", watts: 0, kind: "poe", note: `Alimentado por PoE desde el switch (${fmt1(w)} W en el switch)`, heatBtu: Math.round(w * BTU_PER_W) });
      continue;
    }
    rows.push({ key: i.key, name: i.name, brand: i.brand, u: uOf.get(i.key) ?? "", watts: p.watts, kind: p.kind, note: p.note, heatBtu: p.heatBtu });
  }
  const poeOutside = hasPse ? input.poeLoads.reduce((a, l) => a + l.watts, 0) : 0;
  if (!hasPse && input.poeLoads.length) warnings.push(`${input.poeLoads.length} equipo(s) PoE ${input.scope === "central" ? "de los ambientes" : "de la sala"} (${fmt1(input.poeLoads.reduce((a, l) => a + l.watts, 0))} W) sin switch PoE en este rack: se alimentan desde otro rack o con inyectores.`);
  const poeTotal = poeInRack + poeOutside;
  if (hasPse && poeTotal > 0) {
    // El consumo PoE se suma a la toma del primer switch PoE.
    const sw = rows.find((r) => r.key === pse[0]!.key)!;
    sw.watts = round1(sw.watts + poeTotal);
    sw.note = [sw.note, `incluye ${fmt1(poeTotal)} W de PoE`].filter(Boolean).join(" · ");
  }
  const budgets = pse.map((s) => s.poeBudgetW).filter((b): b is number => b != null && b > 0);
  const poeBudgetW = budgets.length === pse.length && budgets.length ? budgets.reduce((a, b) => a + b, 0) : null;
  if (poeBudgetW != null && poeTotal > poeBudgetW) warnings.push(`Carga PoE de ${fmt1(poeTotal)} W supera el presupuesto PoE del switch (${fmt1(poeBudgetW)} W).`);
  else if (poeBudgetW != null && poeTotal > poeBudgetW * CONTINUOUS_LOAD) warnings.push(`Carga PoE de ${fmt1(poeTotal)} W: más del 80 % del presupuesto del switch (${fmt1(poeBudgetW)} W).`);
  if (hasPse && poeTotal > 0 && poeBudgetW == null) warnings.push("Presupuesto PoE del switch sin dato en la ficha: verificar que alcance para la carga PoE.");

  const totalW = round1(rows.reduce((a, r) => a + r.watts, 0));
  const estimatedW = round1(rows.filter((r) => r.kind === "estimado").reduce((a, r) => a + r.watts, 0) + input.poeLoads.filter((l) => l.estimated && hasPse).reduce((a, l) => a + l.watts, 0));
  const amps = round1(totalW / MAINS_V);
  const outlets = rows.filter((r) => r.kind !== "poe").length;
  // Calor dentro del rack: el de cada equipo (de la ficha si lo trae) menos lo que el PoE lleva a la sala.
  const heatBtu = Math.max(0, Math.round(rows.reduce((a, r) => a + (r.kind === "poe" ? 0 : r.heatBtu), 0) + poeInRack * BTU_PER_W));
  const heatW = round1(heatBtu / BTU_PER_W);
  const pdu = pduFor(outlets, amps);
  const ventilation = ventilationFor(heatW);
  if (pdu.circuits > 1) warnings.push(`Consumo de ${fmt1(amps)} A: repartir en ${pdu.circuits} circuitos de ${pdu.amps} A.`);
  if (estimatedW > 0) warnings.push(`${fmt1(estimatedW)} W del consumo son estimados (la ficha no trae el dato): confirmar con el fabricante.`);
  const estimatedBlocks = blocks.filter((b) => b.estimated && b.kind !== "blank");
  if (estimatedBlocks.length) warnings.push(`Alto en U estimado en ${estimatedBlocks.length} lugar(es) (≈): confirmar con la ficha antes de comprar el rack.`);

  // Profundidad y peso.
  const depths = items.map((i) => pos(i.sizeCm?.d)).filter((d): d is number => d != null);
  const maxDepth = depths.length ? Math.max(...depths) : null;
  const depthCm = maxDepth ? (RACK_DEPTHS.find((d) => d >= maxDepth + DEPTH_CLEARANCE_CM) ?? Math.ceil((maxDepth + DEPTH_CLEARANCE_CM) / 10) * 10) : null;
  const weightKg = round1(items.reduce((a, i) => a + (pos(i.weightKg) ?? 0), 0));
  const weightEstimated = items.some((i) => !pos(i.weightKg));

  notes.push(
    "Orden: red arriba, procesamiento y control, fuentes y reproductores, amplificadores abajo (peso y calor) y PDU en la última unidad.",
    "1U = 4,445 cm. Alto en U de la ficha; ≈ = deducido de las medidas o estimado.",
    `Rack sugerido con al menos ${Math.round(RACK_RESERVE * 100)} % libre (tapas ciegas arriba de la amplificación).`,
    `Corriente a ${MAINS_V} V (FP ≈ 1). PDU con 25 % de tomas libres y carga continua ≤ 80 % de su corriente.`,
    "Calor: el declarado en la ficha o W × 3,412 BTU/h; el PoE que va a la sala no queda en el rack.",
    `Ventilación: hasta 300 W de calor pasiva; de 300 a 1500 W forzada (CFM = 3,16 × W ÷ 15 °F); más, sala climatizada.`,
  );

  return {
    id: input.id,
    title: input.title,
    scope: input.scope,
    empty: items.length === 0,
    sizeU,
    usedU,
    freeU,
    reserve: sizeU ? freeU / sizeU : 0,
    depthCm,
    weightKg,
    weightEstimated,
    // Cada equipo con lo que toma de la PDU (el switch con su PoE), para las referencias del dibujo.
    blocks: blocks.map((b) => ({ ...b, items: b.items.map((it) => ({ ...it, watts: rows.find((r) => r.key === it.key)?.watts })) })),
    power: { rows, totalW, estimatedW, amps, outlets, poeOutsideW: round1(poeOutside), poeInRackW: round1(poeInRack), poeBudgetW, heatBtu, heatW, pdu, ventilation },
    warnings,
    info: input.notes ?? [],
    notes,
    order: ordered.map((b) => b.key),
  };
}

/** Mueve un bloque una posición arriba (-1) o abajo (+1) en el orden; devuelve el orden nuevo. */
export function moveInOrder(order: string[], key: string, dir: -1 | 1): string[] {
  const i = order.indexOf(key);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= order.length) return order;
  const next = [...order];
  [next[i], next[j]] = [next[j]!, next[i]!];
  return next;
}

/** Lleva un bloque a la posición de otro (arrastrar y soltar). */
export function dropInOrder(order: string[], key: string, beforeKey: string): string[] {
  if (key === beforeKey || !order.includes(key)) return order;
  const without = order.filter((k) => k !== key);
  const at = without.indexOf(beforeKey);
  return at < 0 ? [...without, key] : [...without.slice(0, at), key, ...without.slice(at)];
}

export { POWER_KIND_LABEL };
