"use client";

/** Plano del proyecto con sus ambientes marcados: tocás uno y entrás a su sala 3D. */

import Link from "next/link";
import type { PlanRoomLink } from "@/services/room-builder/plan-project";
import { ROOM_COLORS } from "./plan-canvas";

export type HubPlanData = { planImage?: { url: string; widthPx: number; heightPx: number }; planRooms?: PlanRoomLink[] };

/** Lee los datos del plano guardados en la escena del proyecto contenedor. */
export function readHubPlan(sceneJson: unknown): Required<HubPlanData> | null {
  if (!sceneJson || typeof sceneJson !== "object") return null;
  const s = sceneJson as HubPlanData;
  if (!s.planImage?.url || !Array.isArray(s.planRooms)) return null;
  return { planImage: s.planImage, planRooms: s.planRooms };
}

export function HubPlan({ data, existingIds }: { data: Required<HubPlanData>; existingIds: Set<string> }) {
  const rooms = data.planRooms.filter((r) => existingIds.has(r.projectId));
  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={data.planImage.url} alt="Plano del proyecto" className="block w-full select-none" draggable={false} />
      {rooms.map((r, i) => {
        const color = ROOM_COLORS[i % ROOM_COLORS.length];
        return (
          <Link
            key={r.projectId}
            href={`/admin/room-builder/${r.projectId}`}
            className="group absolute flex items-start justify-start rounded-md border-2 p-1.5 transition hover:shadow-lg"
            style={{
              left: `${r.box.x0 * 100}%`,
              top: `${r.box.y0 * 100}%`,
              width: `${(r.box.x1 - r.box.x0) * 100}%`,
              height: `${(r.box.y1 - r.box.y0) * 100}%`,
              borderColor: color,
              background: `${color}22`,
            }}
            title={`Entrar a ${r.name}`}
          >
            <span className="rounded px-1.5 py-0.5 text-[11px] font-bold text-white shadow-sm group-hover:scale-105" style={{ background: color }}>
              {r.name}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
