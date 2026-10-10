/**
 * Cableado de una escena guardada: arma los nodos (una unidad por equipo, en
 * su lugar real), la conexión de mesa y la salida al rack central, y corre el
 * motor. Lo usan el editor (en vivo) y la cotización (en el servidor).
 */

import { planCabling, type CableNode, type CablingPlan } from "./cabling";
import type { CablingProfile } from "./cabling-db";
import { resolveSceneFurniture } from "./furnishing";
import type { RoomScene } from "./scene";
import { layoutSceneDevices, sceneDims } from "./units";

/** Montaje por rol cuando el equipo no tiene un lugar de la tipología. */
const MOUNT_BY_ROLE: Record<string, string> = { display: "wall", camera: "wall", mic: "ceiling", speaker: "ceiling", touch: "table", codec: "rack", processor: "rack" };
const TABLE_KINDS = new Set(["conference-table", "round-table", "desk"]);
const TABLE_TOP_M = 0.75;

/** Dónde sale el cableado hacia el rack central: la puerta del plano o una esquina. */
export function centralExit(scene: RoomScene): { x: number; z: number } {
  const plan = scene.plan;
  const door = plan?.openings?.find((o) => o.kind === "door");
  const wall = door ? plan?.walls.find((w) => w.id === door.wall) : undefined;
  if (door && wall) {
    const len = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y) || 1;
    const t = (door.from + door.to) / 2 / len;
    return { x: wall.a.x + (wall.b.x - wall.a.x) * t, z: wall.a.y + (wall.b.y - wall.a.y) * t };
  }
  return { x: -scene.widthM / 2 + 0.2, z: -scene.depthM / 2 + 0.2 };
}

export function buildCableNodes(scene: RoomScene, profile: CablingProfile): CableNode[] {
  const dims = sceneDims(scene);
  const slots = new Map(scene.slots.map((s) => [s.key, s]));
  const nodes: CableNode[] = [];
  const laid = layoutSceneDevices(scene.devices, slots, dims);
  for (const [i, d] of scene.devices.entries()) {
    const info = profile.devices[d.id];
    if (!info || (!d.productId && !d.generic)) continue;
    const slot = slots.get(d.slotKey);
    const units = laid[i]!.device.units ?? [];
    const mount = slot?.mount ?? MOUNT_BY_ROLE[d.designRole] ?? "rack";
    units.forEach((u, k) => {
      nodes.push({
        id: `${d.id}#${k}`,
        label: units.length > 1 ? `${info.label} (${k + 1})` : info.label,
        cls: info.cls,
        ports: info.ports,
        pos: { x: u.pose.x, y: u.pose.y, z: u.pose.z },
        mount,
        productId: d.productId,
      });
    });
  }
  // Equipos reales del rack central: fuera de la sala, en la salida hacia la sala técnica.
  if (profile.central && profile.centralDevices?.length) {
    const exit = centralExit(scene);
    for (const c of profile.centralDevices) {
      for (let k = 0; k < c.quantity; k++) {
        // Amplificador compartido: solo las unidades y canales asignados a esta sala.
        const grant = c.grants ? c.grants.find((g) => g.unit === k) : undefined;
        if (c.grants && !grant) continue;
        nodes.push({
          id: `central:${c.key}#${k}`,
          label: `${c.label}${c.quantity > 1 ? ` (${k + 1})` : ""} · rack central`,
          cls: c.cls,
          ports: c.ports,
          pos: { x: exit.x, y: CENTRAL_RACK_Y, z: exit.z },
          mount: "rack",
          productId: c.productId,
          ...(grant ? { channelMap: grant.channels } : {}),
        });
      }
    }
  }
  return nodes;
}

/** Altura del equipo central en el punto de salida (m). */
const CENTRAL_RACK_Y = 0.45;

export function cablingForScene(scene: RoomScene, category: string, profile: CablingProfile): CablingPlan {
  const nodes = buildCableNodes(scene, profile);
  const tables = resolveSceneFurniture(scene, category).filter((f) => !f.hiddenBy && TABLE_KINDS.has(f.kind));
  const table = [...tables].sort((a, b) => (b.w ?? 1) * (b.d ?? 1) - (a.w ?? 1) * (a.d ?? 1))[0];
  const hasConferencing = nodes.some((n) => n.cls === "codec" || n.cls === "camera");
  const input = {
    dims: { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM },
    tableInput: table && hasConferencing ? { x: table.x, z: table.z, topY: TABLE_TOP_M } : null,
    central: profile.central ? { label: profile.central.label, exit: centralExit(scene) } : null,
  };
  const first = planCabling({ ...input, nodes });
  // Del rack central entra solo lo que alimenta esta sala: el resto sirve a otros ambientes.
  // Un amplificador central entra solo si mueve parlantes de esta sala (recibir audio no alcanza).
  const serves = (n: CableNode) => (n.cls === "amp" ? first.links.some((l) => l.from === n.id && l.signal === "speaker") : first.links.some((l) => l.from === n.id || l.to === n.id));
  const unused = nodes.filter((n) => n.id.startsWith("central:") && !serves(n));
  if (!unused.length) return first;
  const drop = new Set(unused.map((n) => n.id));
  return planCabling({ ...input, nodes: nodes.filter((n) => !drop.has(n.id)) });
}
