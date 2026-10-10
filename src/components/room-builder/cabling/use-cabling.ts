"use client";

/**
 * Cableado del ambiente en vivo: trae de la base los puertos de ficha de cada
 * equipo y los cables del catálogo, y arma el cableado con las posiciones
 * reales de la sala (al mover un equipo, recorridos y metros se recalculan).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import type { CablingPlan } from "@/services/room-builder/cabling";
import type { CablingProfile } from "@/services/room-builder/cabling-db";
import { cablingForScene } from "@/services/room-builder/cabling-scene";
import { pickCables, type CableMissing, type CablePickLine, type CableProduct } from "@/services/room-builder/cable-picks";
import type { RoomScene } from "@/services/room-builder/scene";

export type CablingState = {
  plan: CablingPlan | null;
  profile: CablingProfile | null;
  /** Cables del catálogo elegidos para este cableado y los que no hay. */
  picks: { lines: CablePickLine[]; missing: CableMissing[] } | null;
  loading: boolean;
  /** Lectura de fichas en curso (productos sin ficha). */
  reading: boolean;
  error: string | null;
  readDatasheets: (productIds: string[]) => Promise<void>;
  reload: () => Promise<void>;
  /** Suma los equipos que faltan (amplificador, fuente de video, streaming, switch). */
  completeEquipment: () => Promise<{ applied: Array<{ label: string; scope: "central" | "room" }>; pending: string[] } | null>;
  completing: boolean;
  /** Cables del catálogo (para elegir el de cada tramo en el plano técnico). */
  catalog: CableProduct[] | null;
};

export function useCabling(projectId: string, scene: RoomScene, category: string): CablingState {
  const [profile, setProfile] = useState<CablingProfile | null>(null);
  const [catalog, setCatalog] = useState<CableProduct[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [reading, setReading] = useState(false);
  const [completing, setCompleting] = useState(false);
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

  useEffect(() => {
    let alive = true;
    fetch("/api/admin/room-builder/cable-catalog")
      .then((r) => r.json())
      .then((j) => {
        if (alive && j?.ok) setCatalog(j.cables as CableProduct[]);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

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

  const completeEquipment = useCallback(async () => {
    setCompleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/room-builder/projects/${projectId}/complete-equipment`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!json?.ok) throw new Error(json?.error || "No se pudieron completar los equipos");
      return { applied: json.applied ?? [], pending: json.pending ?? [] };
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudieron completar los equipos");
      return null;
    } finally {
      setCompleting(false);
    }
  }, [projectId]);

  const plan = useMemo(() => (profile ? cablingForScene(scene, category, profile) : null), [profile, scene, category]);
  const picks = useMemo(() => (plan && catalog ? pickCables(plan, catalog) : null), [plan, catalog]);

  return { plan, profile, picks, loading, reading, error, readDatasheets, reload, completeEquipment, completing, catalog };
}
