"use client";

/**
 * Cableado del ambiente en vivo: trae de la base los puertos de ficha de cada
 * equipo y arma el cableado con las posiciones reales de la sala (al mover un
 * equipo, los recorridos y los metros se recalculan al instante).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { planCabling, type CableNode, type CablingPlan } from "@/services/room-builder/cabling";
import type { CablingProfile } from "@/services/room-builder/cabling-db";
import { resolveSceneFurniture } from "@/services/room-builder/furnishing";
import type { RoomScene } from "@/services/room-builder/scene";
import { normalizeDeviceUnits, sceneDims } from "@/services/room-builder/units";

/** Montaje por rol cuando el equipo no tiene un lugar de la tipología. */
const MOUNT_BY_ROLE: Record<string, string> = { display: "wall", camera: "wall", mic: "ceiling", speaker: "ceiling", touch: "table", codec: "rack", processor: "rack" };
const TABLE_KINDS = new Set(["conference-table", "round-table", "desk"]);
const TABLE_TOP_M = 0.75;

export type CablingState = {
  plan: CablingPlan | null;
  profile: CablingProfile | null;
  loading: boolean;
  /** Lectura de fichas en curso (productos sin ficha). */
  reading: boolean;
  error: string | null;
  readDatasheets: (productIds: string[]) => Promise<void>;
  reload: () => Promise<void>;
};

/** Dónde sale el cableado hacia el rack central: la puerta del plano o una esquina. */
function centralExit(scene: RoomScene): { x: number; z: number } {
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
  for (const d of scene.devices) {
    const info = profile.devices[d.id];
    if (!info || !d.productId) continue;
    const slot = slots.get(d.slotKey);
    const units = normalizeDeviceUnits(d, slot, dims).units ?? [];
    const mount = slot?.mount ?? MOUNT_BY_ROLE[d.designRole] ?? "rack";
    units.forEach((u, k) => {
      nodes.push({
        id: `${d.id}#${k}`,
        label: units.length > 1 ? `${d.productName ?? d.label} (${k + 1})` : (d.productName ?? d.label),
        cls: info.cls,
        ports: info.ports,
        pos: { x: u.pose.x, y: u.pose.y, z: u.pose.z },
        mount,
        productId: d.productId,
      });
    });
  }
  return nodes;
}

export function useCabling(projectId: string, scene: RoomScene, category: string): CablingState {
  const [profile, setProfile] = useState<CablingProfile | null>(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const devicesKey = scene.devices.map((d) => `${d.id}:${d.productId ?? ""}:${d.quantity}`).join("|");

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}/cabling`);
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error ?? "No se pudo leer el cableado");
      setProfile(json.profile as CablingProfile);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el cableado");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void reload();
  }, [reload, devicesKey]);

  const readDatasheets = useCallback(
    async (productIds: string[]) => {
      if (!productIds.length) return;
      setReading(true);
      setError(null);
      try {
        // De a pocos: cada ficha se busca, se descarga y se lee.
        for (let i = 0; i < productIds.length; i += 6) {
          const res = await fetch("/api/admin/room-builder/io-profiles", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ productIds: productIds.slice(i, i + 6), limit: 6, force: true }),
          });
          const json = await res.json().catch(() => null);
          if (!json?.ok) throw new Error(json?.error ?? "No se pudieron leer las fichas");
        }
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudieron leer las fichas");
      } finally {
        setReading(false);
      }
    },
    [reload],
  );

  const plan = useMemo(() => {
    if (!profile) return null;
    const nodes = buildCableNodes(scene, profile);
    const tables = resolveSceneFurniture(scene, category).filter((f) => !f.hiddenBy && TABLE_KINDS.has(f.kind));
    const table = tables.sort((a, b) => (b.w ?? 1) * (b.d ?? 1) - (a.w ?? 1) * (a.d ?? 1))[0];
    const hasConferencing = nodes.some((n) => n.cls === "codec" || n.cls === "camera");
    return planCabling({
      nodes,
      dims: { widthM: scene.widthM, depthM: scene.depthM, heightM: scene.heightM },
      tableInput: table && hasConferencing ? { x: table.x, z: table.z, topY: TABLE_TOP_M } : null,
      central: profile.central ? { label: profile.central.label, exit: centralExit(scene) } : null,
    });
  }, [profile, scene, category]);

  return { plan, profile, loading, reading, error, readDatasheets, reload };
}
