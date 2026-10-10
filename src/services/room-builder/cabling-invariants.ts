/**
 * Reglas que un cableado nunca puede romper (auditoría de integrador). Se
 * usan en las pruebas masivas y en la auditoría de producción: cada violación
 * es un error del motor, no del diseño de la sala.
 */

import { portCount } from "./device-ports";
import type { CablingPlan } from "./cabling";

export type Violation = { rule: string; detail: string };

const EPS = 1e-6;
/** Tolerancia de obra para decidir si un tramo se movió en un eje (1 mm). */
const MM = 1e-3;

export function auditCabling(plan: CablingPlan, dims: { widthM: number; depthM: number; heightM: number }): Violation[] {
  const v: Violation[] = [];
  const byId = new Map(plan.nodes.map((n) => [n.id, n]));
  const findingText = plan.findings.map((f) => `${f.title} ${f.detail}`).join(" | ");
  const mentioned = (label: string) => findingText.includes(label);

  for (const l of plan.links) {
    const a = byId.get(l.from);
    const b = byId.get(l.to);
    if (!a || !b) {
      v.push({ rule: "extremo-inexistente", detail: `${l.id}` });
      continue;
    }
    // 1) La señal existe en los dos extremos (salvo puntos virtuales).
    if (l.signal === "wireless") {
      const pa = a.ports?.wireless ?? [];
      const pb = b.ports?.wireless ?? [];
      if (!pa.some((w) => w.protocol === l.protocol) || !pb.some((w) => w.protocol === l.protocol)) v.push({ rule: "inalambrico-protocolo", detail: `${a.label} ↔ ${b.label} (${l.protocol})` });
    } else {
      if (!a.virtual && a.ports && portCount(a.ports, "outputs", l.signal) === 0 && !(l.signal === "lan" || l.signal === "dante")) v.push({ rule: "salida-inexistente", detail: `${a.label} no tiene salida ${l.signal}` });
      if (!b.virtual && b.ports && portCount(b.ports, "inputs", l.signal) === 0 && !(l.signal === "lan" || l.signal === "dante")) v.push({ rule: "entrada-inexistente", detail: `${b.label} no tiene entrada ${l.signal}` });
      if ((l.signal === "lan" || l.signal === "dante") && ((!a.virtual && (a.ports?.network ?? 0) === 0) || (!b.virtual && (b.ports?.network ?? 0) === 0))) v.push({ rule: "red-sin-puerto", detail: `${a.label} → ${b.label}` });
    }
    // 2) Recorrido: empieza y termina en los equipos, dentro de la sala y bajo el techo.
    if (l.signal !== "wireless") {
      const first = l.route[0];
      const last = l.route[l.route.length - 1];
      if (!first || !last || Math.hypot(first[0] - a.pos.x, first[1] - a.pos.y, first[2] - a.pos.z) > EPS || Math.hypot(last[0] - b.pos.x, last[1] - b.pos.y, last[2] - b.pos.z) > EPS) {
        v.push({ rule: "recorrido-extremos", detail: `${a.label} → ${b.label}` });
      }
      for (const p of l.route) {
        if (p[1] < -EPS || p[1] > dims.heightM + EPS) v.push({ rule: "recorrido-altura", detail: `${a.label} → ${b.label}: y=${p[1]}` });
        const outside = Math.abs(p[0]) > dims.widthM / 2 + 0.05 || Math.abs(p[2]) > dims.depthM / 2 + 0.05;
        if (outside && !a.virtual && !b.virtual) v.push({ rule: "recorrido-fuera", detail: `${a.label} → ${b.label}: (${p[0]}, ${p[2]})` });
      }
      // Tramos ortogonales (pared, cielorraso): nunca en diagonal.
      for (let i = 1; i < l.route.length; i++) {
        const p = l.route[i - 1]!;
        const q = l.route[i]!;
        const moved = [Math.abs(q[0] - p[0]) > MM, Math.abs(q[1] - p[1]) > MM, Math.abs(q[2] - p[2]) > MM].filter(Boolean).length;
        if (moved > 1) v.push({ rule: "tramo-diagonal", detail: `${a.label} → ${b.label}` });
      }
      if (!(l.cableM > 0) || l.cableM + EPS < l.runM) v.push({ rule: "metros", detail: `${a.label} → ${b.label}: run ${l.runM} cable ${l.cableM}` });
    }
  }

  // 3) Puertos: el uso de cada señal no supera lo declarado sin un aviso.
  const used = new Map<string, number>();
  for (const l of plan.links) {
    if (l.signal === "wireless" || l.signal === "lan" || l.signal === "dante") continue;
    used.set(`${l.from}|outputs|${l.signal}`, (used.get(`${l.from}|outputs|${l.signal}`) ?? 0) + 1);
    used.set(`${l.to}|inputs|${l.signal}`, (used.get(`${l.to}|inputs|${l.signal}`) ?? 0) + 1);
  }
  for (const [k, n] of used) {
    const [id, side, signal] = k.split("|") as [string, "inputs" | "outputs", never];
    const node = byId.get(id);
    if (!node || node.virtual || !node.ports) continue;
    const have = portCount(node.ports, side, signal);
    // Salidas de parlante: varios parlantes por canal; el tope (2 en baja impedancia) se controla abajo por canal.
    if (side === "outputs" && (signal as string) === "speaker") {
      const lowZ = node.ports.lineVoltage !== "70v" && node.ports.lineVoltage !== "100v" && node.ports.lineVoltage !== "both";
      if (lowZ && n > have * 2 && !plan.findings.some((f) => /canal|amplific/i.test(f.title))) v.push({ rule: "canal-sobrecargado-sin-aviso", detail: `${node.label}: ${n} parlantes en ${have} canales` });
      continue;
    }
    if (n > have && !plan.findings.some((f) => f.id.startsWith("ports-") && f.detail.includes(node.label))) v.push({ rule: "puertos-excedidos-sin-aviso", detail: `${node.label}: ${n}/${have} ${signal}` });
  }

  // 4) Nadie queda suelto sin aviso.
  const linked = (id: string) => plan.links.some((l) => l.from === id || l.to === id);
  for (const n of plan.nodes) {
    if (n.virtual || !n.ports) continue;
    const hasAny = n.ports.inputs.length || n.ports.outputs.length || n.ports.network || (n.ports.wireless ?? []).length;
    if (!hasAny) continue;
    if (!linked(n.id) && !mentioned(n.label)) v.push({ rule: "equipo-suelto-sin-aviso", detail: `${n.label} (${n.cls})` });
  }
  // Parlantes pasivos: conectados o con aviso.
  for (const n of plan.nodes) {
    if (n.virtual || !n.ports || (n.cls !== "speaker" && n.cls !== "subwoofer")) continue;
    if (portCount(n.ports, "inputs", "speaker") > 0 && !plan.links.some((l) => l.to === n.id && l.signal === "speaker") && !plan.findings.some((f) => /parlante|amplific|canal/i.test(f.title))) {
      v.push({ rule: "parlante-sin-amplificar-sin-aviso", detail: n.label });
    }
  }
  // Equipos sin ficha: siempre listados.
  for (const m of plan.missing) if (!mentioned(m.label)) v.push({ rule: "sin-ficha-sin-aviso", detail: m.label });

  // 5) Reglas de audio: baja impedancia hasta 2 parlantes por canal; 70/100 V con parlante de baja impedancia, avisado.
  const perChannel = new Map<string, number>();
  for (const l of plan.links.filter((x) => x.signal === "speaker")) {
    const amp = byId.get(l.from);
    if (!amp || amp.virtual || !amp.ports) continue;
    const highZ = ["70v", "100v", "both"].includes(amp.ports.lineVoltage ?? "");
    const k = `${l.from}|${l.fromPort}`;
    const n = (perChannel.get(k) ?? 0) + 1;
    perChannel.set(k, n);
    if (!highZ && n > 2) v.push({ rule: "canal-baja-z-sobrecargado", detail: `${amp.label} ${l.fromPort}: ${n} parlantes` });
    const spk = byId.get(l.to);
    if (highZ && amp.ports.lineVoltage !== "both" && spk?.ports?.lineVoltage === "low-z" && !mentioned(spk.label)) v.push({ rule: "baja-z-en-70v-sin-aviso", detail: `${spk.label}` });
  }

  // 6) PoE y Dante: excesos avisados.
  for (const sw of plan.nodes.filter((n) => n.cls === "switch" && !n.virtual && n.ports)) {
    const pds = plan.links.filter((l) => l.to === sw.id && (l.signal === "lan" || l.signal === "dante")).map((l) => byId.get(l.from)).filter((n) => n?.ports?.poeWatts != null);
    const need = pds.reduce((s, n) => s + (n!.ports!.poeWatts ?? 0), 0);
    if (pds.length && !sw.ports!.poeSource && !plan.findings.some((f) => f.id === "poe-none")) v.push({ rule: "poe-sin-aviso", detail: `${sw.label} sin PoE` });
    if (pds.length && sw.ports!.poeBudgetWatts != null && need > sw.ports!.poeBudgetWatts && !plan.findings.some((f) => f.id === "poe-budget")) v.push({ rule: "presupuesto-poe-sin-aviso", detail: `${need} W > ${sw.ports!.poeBudgetWatts} W` });
  }
  const tx = plan.nodes.filter((n) => n.cls === "mic" && n.ports).reduce((s, n) => s + (n.ports!.danteTx ?? 0), 0);
  const rxNode = plan.nodes.find((n) => n.cls === "dsp" && n.ports) ?? plan.nodes.find((n) => n.cls === "codec" && n.ports);
  if (tx && rxNode?.ports?.danteRx != null && tx > rxNode.ports.danteRx && !plan.findings.some((f) => f.id === "dante-rx")) v.push({ rule: "dante-sin-aviso", detail: `${tx} > ${rxNode.ports.danteRx}` });

  // 7) Pantallas: con señal o avisadas.
  for (const d of plan.nodes.filter((n) => n.cls === "display" && !n.virtual && n.ports)) {
    if (!plan.links.some((l) => l.to === d.id && (l.signal === "hdmi" || l.signal === "hdbaset")) && !mentioned(d.label) && !plan.findings.some((f) => f.id === "video-outs" || f.id === "video-split")) {
      v.push({ rule: "pantalla-sin-senal-sin-aviso", detail: d.label });
    }
  }

  // 8) Totales consistentes.
  for (const t of plan.totals) {
    const sum = plan.links.filter((l) => l.signal === t.signal).reduce((s, l) => s + l.cableM, 0);
    if (Math.abs(sum - t.meters) > 0.11) v.push({ rule: "totales", detail: `${t.signal}: ${t.meters} vs ${sum}` });
  }
  return v;
}
