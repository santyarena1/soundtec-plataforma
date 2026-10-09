"use client";

/**
 * Cables en el 3D: cada conexión por su recorrido real (subida por pared,
 * cielorraso, bajada), con el color de su señal. Los tramos que van juntos
 * por el cielorraso se separan un poco para que se lean como un mazo.
 */

import { Line } from "@react-three/drei";
import { SIGNAL_INFO } from "@/services/room-builder/device-ports";
import type { CableLink, Point3 } from "@/services/room-builder/cabling";

/** Separación entre cables paralelos (m). */
const SPREAD_M = 0.025;

export function CableLayer({ links }: { links: CableLink[] }) {
  return (
    <group userData={{ noExport: true }}>
      {links.map((l, k) => {
        const off = ((k % 9) - 4) * SPREAD_M;
        const pts = l.route.map((p, i): Point3 => (i === 0 || i === l.route.length - 1 ? p : [p[0] + off, p[1] - Math.abs(off) * 0.3, p[2] + off]));
        return <Line key={l.id} points={pts} color={SIGNAL_INFO[l.signal].color} lineWidth={2.2} transparent opacity={0.9} />;
      })}
    </group>
  );
}
