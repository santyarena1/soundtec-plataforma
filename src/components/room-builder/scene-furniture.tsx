"use client";

import { hotelGuestAnchors } from "@/services/room-builder/slot-layout";
import {
  BarCounter,
  BarStool,
  Bed,
  Chair,
  CoffeeTable,
  ControlConsole,
  Credenza,
  DeskTable,
  Lectern,
  LoungeChair,
  MAT,
  MediaConsole,
  Nightstand,
  Planter,
  RackCabinet,
  ReceptionDesk,
  RoundTable,
  SideChair,
  Sofa,
  Stage,
  Whiteboard,
} from "./scene-primitives";
export { roomTheme } from "./room-theme";

function chairsAroundTable(
  tableW: number,
  tableD: number,
  count: number,
) {
  const items: Array<{ x: number; z: number; rotY: number }> = [];
  const long = Math.max(2, Math.floor(count / 2));
  const sideN = Math.floor(long / 2);
  for (let i = 0; i < sideN; i++) {
    const t = sideN === 1 ? 0 : (i / (sideN - 1) - 0.5) * (tableW - 0.6);
    items.push({ x: t, z: tableD / 2 + 0.45, rotY: Math.PI });
    items.push({ x: t, z: -(tableD / 2 + 0.45), rotY: 0 });
  }
  // cabeceras
  items.push({ x: -(tableW / 2 + 0.45), z: 0, rotY: Math.PI / 2 });
  items.push({ x: tableW / 2 + 0.45, z: 0, rotY: -Math.PI / 2 });
  return items.slice(0, count);
}

function VideoconferenceFurniture({
  widthM,
  depthM,
  size,
}: {
  widthM: number;
  depthM: number;
  size: "S" | "M" | "L";
}) {
  const tableW = size === "S" ? 1.6 : size === "M" ? 2.6 : 3.8;
  const tableD = size === "S" ? 0.9 : size === "M" ? 1.2 : 1.45;
  const nChairs = size === "S" ? 4 : size === "M" ? 8 : 12;
  return (
    <group>
      <DeskTable width={tableW} depth={tableD} color={MAT.wood} />
      {chairsAroundTable(tableW, tableD, nChairs).map((c, i) => (
        <Chair key={i} x={c.x} z={c.z} rotY={c.rotY} />
      ))}
      <Credenza
        width={Math.min(widthM * 0.45, 1.8)}
        x={-widthM * 0.28}
        z={-depthM / 2 + 0.35}
      />
      <Credenza
        width={Math.min(widthM * 0.35, 1.4)}
        x={widthM * 0.3}
        z={-depthM / 2 + 0.35}
      />
      {/* franja AV en pared frontal */}
      <mesh position={[0, 1.35, depthM / 2 - 0.06]}>
        <boxGeometry args={[Math.min(widthM * 0.7, 3.2), 1.4, 0.04]} />
        <meshStandardMaterial color={MAT.wallAccent} roughness={0.9} />
      </mesh>
    </group>
  );
}

function ClassroomFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  const rows = 4;
  const cols = Math.max(3, Math.floor(widthM / 1.1));
  const startZ = -depthM * 0.28;
  const rowGap = depthM * 0.16;
  return (
    <group>
      <Whiteboard
        width={Math.min(widthM * 0.55, 3.2)}
        height={1.2}
        x={0}
        y={1.5}
        z={depthM / 2 - 0.08}
        rotY={Math.PI}
      />
      <Lectern x={-widthM * 0.28} z={depthM * 0.28} />
      <DeskTable
        width={1.4}
        depth={0.7}
        x={widthM * 0.15}
        z={depthM * 0.28}
        color={MAT.woodDark}
      />
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((__, col) => {
          const x = (col - (cols - 1) / 2) * 0.95;
          const z = startZ + row * rowGap;
          return (
            <group key={`${row}-${col}`}>
              <DeskTable
                width={0.7}
                depth={0.45}
                x={x}
                z={z}
                color={MAT.woodLight}
              />
              <SideChair x={x} z={z - 0.4} rotY={0} />
            </group>
          );
        }),
      )}
    </group>
  );
}

function TrainingFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  // Forma en U hacia el frente AV
  const seats: Array<{ x: number; z: number; rotY: number }> = [];
  const armLen = Math.floor(depthM / 0.9);
  for (let i = 0; i < armLen; i++) {
    const z = -depthM * 0.25 + i * 0.85;
    seats.push({ x: -widthM * 0.32, z, rotY: Math.PI / 2 });
    seats.push({ x: widthM * 0.32, z, rotY: -Math.PI / 2 });
  }
  for (let i = 0; i < Math.floor(widthM / 0.9); i++) {
    const x = (i - Math.floor(widthM / 0.9) / 2) * 0.85;
    seats.push({ x, z: -depthM * 0.32, rotY: 0 });
  }
  return (
    <group>
      <Whiteboard
        width={Math.min(widthM * 0.5, 2.8)}
        height={1.1}
        x={0}
        y={1.55}
        z={depthM / 2 - 0.08}
        rotY={Math.PI}
      />
      <Lectern x={0} z={depthM * 0.22} />
      <DeskTable width={2.2} depth={0.7} x={0} z={depthM * 0.05} />
      {seats.map((s, i) => (
        <group key={i}>
          <DeskTable
            width={0.65}
            depth={0.4}
            x={s.x}
            z={s.z}
            color={MAT.woodLight}
          />
          <Chair
            x={s.x + Math.sin(s.rotY) * 0.4}
            z={s.z + Math.cos(s.rotY) * 0.4}
            rotY={s.rotY + Math.PI}
            color="#3d5a80"
          />
        </group>
      ))}
    </group>
  );
}

function HotelGuestFurniture({
  widthM,
  depthM,
  heightM = 2.6,
}: {
  widthM: number;
  depthM: number;
  heightM?: number;
}) {
  const g = hotelGuestAnchors({ widthM, depthM, heightM });
  return (
    <group>
      <Bed width={g.bedW} depth={g.bedD} x={0} z={g.bedZ} />
      <Nightstand x={-g.nightstandX} z={g.nightstandZ} />
      <Nightstand x={g.nightstandX} z={g.nightstandZ} />
      <MediaConsole
        width={Math.min(widthM * 0.55, 1.6)}
        x={0}
        z={g.frontZ - 0.27}
        rotY={Math.PI}
      />
      <DeskTable
        width={1.1}
        depth={0.5}
        x={g.deskX}
        z={g.deskZ}
        color={MAT.woodDark}
      />
      <SideChair
        x={g.deskX}
        z={g.deskZ + 0.45}
        rotY={Math.PI}
        color={MAT.fabricWarm}
      />
      <mesh position={[g.wardrobeX, 1.1, g.wardrobeZ]}>
        <boxGeometry args={[0.55, 2.2, 0.7]} />
        <meshStandardMaterial color={MAT.wood} roughness={0.85} />
      </mesh>
      <Planter x={widthM / 2 - 0.4} z={depthM / 2 - 0.9} scale={0.85} />
    </group>
  );
}

function HotelSuiteFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  return (
    <group>
      {/* living */}
      <Sofa
        width={Math.min(widthM * 0.45, 2.2)}
        x={-widthM * 0.15}
        z={depthM * 0.15}
        rotY={0.15}
      />
      <CoffeeTable x={-widthM * 0.1} z={depthM * 0.32} />
      <LoungeChair x={widthM * 0.25} z={depthM * 0.2} rotY={-0.8} />
      <MediaConsole
        width={Math.min(widthM * 0.5, 1.8)}
        x={0}
        z={depthM / 2 - 0.35}
        rotY={Math.PI}
      />
      {/* dormitorio al fondo */}
      <Bed
        width={Math.min(widthM * 0.45, 1.7)}
        depth={Math.min(depthM * 0.28, 1.9)}
        x={widthM * 0.15}
        z={-depthM * 0.28}
      />
      <Nightstand x={widthM * 0.15 - 1.05} z={-depthM * 0.22} />
      <DeskTable
        width={1}
        depth={0.45}
        x={-widthM / 2 + 0.7}
        z={-depthM / 2 + 0.6}
      />
      <Planter x={widthM / 2 - 0.45} z={0} />
    </group>
  );
}

function HotelPoolBarFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  const stools = Math.max(4, Math.floor(widthM / 0.7));
  return (
    <group>
      <BarCounter width={Math.min(widthM * 0.7, 4)} x={0} z={depthM * 0.15} />
      {Array.from({ length: stools }).map((_, i) => {
        const x = (i - (stools - 1) / 2) * 0.65;
        return <BarStool key={i} x={x} z={depthM * 0.15 - 0.75} />;
      })}
      <RoundTable radius={0.55} x={-widthM * 0.28} z={-depthM * 0.2} color={MAT.woodLight} />
      <RoundTable radius={0.55} x={widthM * 0.28} z={-depthM * 0.25} color={MAT.woodLight} />
      {[
        [-widthM * 0.28, -depthM * 0.2],
        [widthM * 0.28, -depthM * 0.25],
      ].flatMap(([tx, tz], ti) =>
        [0, 1, 2].map((j) => {
          const a = (j / 3) * Math.PI * 2;
          return (
            <SideChair
              key={`${ti}-${j}`}
              x={(tx as number) + Math.cos(a) * 0.85}
              z={(tz as number) + Math.sin(a) * 0.85}
              rotY={-a + Math.PI}
              color="#5b7c6e"
            />
          );
        }),
      )}
      <Planter x={-widthM / 2 + 0.5} z={depthM / 2 - 0.5} scale={1.2} />
      <Planter x={widthM / 2 - 0.5} z={depthM / 2 - 0.5} scale={1.2} />
      {/* sombrilla */}
      <mesh position={[widthM * 0.28, 1.6, -depthM * 0.25]}>
        <cylinderGeometry args={[0.03, 0.03, 2.2, 8]} />
        <meshStandardMaterial color={MAT.metal} />
      </mesh>
      <mesh position={[widthM * 0.28, 2.55, -depthM * 0.25]}>
        <coneGeometry args={[1.1, 0.35, 16]} />
        <meshStandardMaterial color="#e7e5e4" roughness={0.9} />
      </mesh>
    </group>
  );
}

function HotelCommonFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  return (
    <group>
      <Sofa width={2} x={-widthM * 0.2} z={0} rotY={0.2} />
      <Sofa width={1.6} x={widthM * 0.22} z={depthM * 0.15} rotY={-1.2} color="#5c6b7a" />
      <CoffeeTable x={0} z={depthM * 0.05} w={1.3} d={0.7} />
      <LoungeChair x={-widthM * 0.3} z={depthM * 0.25} rotY={0.9} />
      <LoungeChair x={widthM * 0.32} z={-depthM * 0.1} rotY={-2.2} />
      <Planter x={-widthM / 2 + 0.55} z={-depthM / 2 + 0.55} scale={1.3} />
      <Planter x={widthM / 2 - 0.55} z={depthM / 2 - 0.55} scale={1.1} />
      <RoundTable radius={0.45} x={widthM * 0.05} z={-depthM * 0.28} />
    </group>
  );
}

function LobbyFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  return (
    <group>
      <ReceptionDesk
        width={Math.min(widthM * 0.55, 3)}
        depth={0.85}
        x={0}
        z={depthM * 0.2}
      />
      <LoungeChair x={-widthM * 0.3} z={-depthM * 0.2} rotY={0.4} />
      <LoungeChair x={-widthM * 0.12} z={-depthM * 0.28} rotY={-0.2} />
      <CoffeeTable x={-widthM * 0.2} z={-depthM * 0.05} w={0.9} d={0.5} />
      <Sofa
        width={1.8}
        x={widthM * 0.25}
        z={-depthM * 0.15}
        rotY={-0.5}
        color="#4b5563"
      />
      <Planter x={widthM / 2 - 0.5} z={depthM / 2 - 0.6} scale={1.4} />
      <Planter x={-widthM / 2 + 0.5} z={depthM / 2 - 0.6} scale={1.4} />
      {/* columna / totem signage */}
      <mesh position={[widthM * 0.35, 1.2, depthM * 0.05]}>
        <boxGeometry args={[0.35, 2.4, 0.2]} />
        <meshStandardMaterial color={MAT.metalDark} />
      </mesh>
      <mesh position={[widthM * 0.35, 1.5, depthM * 0.16]}>
        <boxGeometry args={[0.3, 1.2, 0.04]} />
        <meshStandardMaterial
          color={MAT.screenLit}
          emissive={MAT.screenLit}
          emissiveIntensity={0.45}
        />
      </mesh>
    </group>
  );
}

function EventFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  const stageD = Math.min(depthM * 0.22, 2.2);
  const rows = 5;
  const cols = Math.max(6, Math.floor(widthM / 0.7));
  return (
    <group>
      <Stage
        width={Math.min(widthM * 0.85, 8)}
        depth={stageD}
        x={0}
        z={depthM / 2 - stageD / 2 - 0.1}
        height={0.55}
      />
      {/* backdrop */}
      <mesh position={[0, 1.8, depthM / 2 - 0.1]}>
        <boxGeometry args={[Math.min(widthM * 0.8, 7), 2.6, 0.08]} />
        <meshStandardMaterial color="#0f172a" roughness={0.95} />
      </mesh>
      {Array.from({ length: rows }).map((_, row) =>
        Array.from({ length: cols }).map((__, col) => {
          const x = (col - (cols - 1) / 2) * 0.65;
          const z = -depthM * 0.35 + row * 0.75;
          return (
            <SideChair
              key={`${row}-${col}`}
              x={x}
              z={z}
              rotY={0}
              color={row % 2 === 0 ? "#334155" : "#475569"}
            />
          );
        }),
      )}
    </group>
  );
}

function ResidentialFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  return (
    <group>
      <Sofa
        width={Math.min(widthM * 0.55, 2.6)}
        x={0}
        z={-depthM * 0.15}
        rotY={0}
        color="#6b5b4f"
      />
      <Sofa
        width={1.5}
        x={-widthM * 0.28}
        z={depthM * 0.05}
        rotY={Math.PI / 2}
        color="#6b5b4f"
      />
      <CoffeeTable x={0.1} z={depthM * 0.05} w={1.2} d={0.65} />
      <MediaConsole
        width={Math.min(widthM * 0.55, 2)}
        x={0}
        z={depthM / 2 - 0.35}
        rotY={Math.PI}
      />
      <LoungeChair x={widthM * 0.3} z={-depthM * 0.05} rotY={-0.9} />
      <Planter x={-widthM / 2 + 0.45} z={depthM / 2 - 0.55} />
      <Credenza
        width={1.2}
        x={widthM / 2 - 0.7}
        z={-depthM / 2 + 0.4}
      />
    </group>
  );
}

function ControlRoomFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  return (
    <group>
      {/* video wall atrás */}
      <mesh position={[0, 1.5, depthM / 2 - 0.1]}>
        <boxGeometry args={[Math.min(widthM * 0.85, 4.5), 1.8, 0.08]} />
        <meshStandardMaterial color={MAT.black} />
      </mesh>
      {[-1.2, -0.4, 0.4, 1.2].map((ox, i) => (
        <mesh key={i} position={[ox, 1.5, depthM / 2 - 0.14]}>
          <boxGeometry args={[0.7, 0.45, 0.03]} />
          <meshStandardMaterial
            color={MAT.screenLit}
            emissive={MAT.screenLit}
            emissiveIntensity={0.55}
          />
        </mesh>
      ))}
      <ControlConsole width={Math.min(widthM * 0.7, 3.2)} x={0} z={0.1} />
      <Chair x={-0.6} z={-0.55} rotY={0} color="#1e293b" />
      <Chair x={0.6} z={-0.55} rotY={0} color="#1e293b" />
      <RackCabinet x={-widthM / 2 + 0.5} z={-depthM / 2 + 0.55} />
      <RackCabinet x={-widthM / 2 + 1.15} z={-depthM / 2 + 0.55} tall={false} />
      <RackCabinet x={widthM / 2 - 0.5} z={-depthM / 2 + 0.55} />
    </group>
  );
}

function SignageCorridorFurniture({
  widthM,
  depthM,
}: {
  widthM: number;
  depthM: number;
}) {
  const n = Math.max(2, Math.floor(depthM / 2.2));
  return (
    <group>
      {Array.from({ length: n }).map((_, i) => {
        const z = -depthM / 2 + 1.2 + i * (depthM / n);
        return (
          <group key={i}>
            <mesh position={[-widthM / 2 + 0.08, 1.5, z]}>
              <boxGeometry args={[0.06, 1.1, 0.7]} />
              <meshStandardMaterial color={MAT.metalDark} />
            </mesh>
            <mesh position={[-widthM / 2 + 0.12, 1.5, z]}>
              <boxGeometry args={[0.03, 0.9, 0.55]} />
              <meshStandardMaterial
                color={MAT.screenLit}
                emissive={MAT.screenLit}
                emissiveIntensity={0.4}
              />
            </mesh>
          </group>
        );
      })}
      {/* banco / asiento pasillo */}
      <BoxishBench x={widthM / 2 - 0.45} z={0} length={Math.min(depthM * 0.5, 2.5)} />
    </group>
  );
}

function BoxishBench({
  x,
  z,
  length,
}: {
  x: number;
  z: number;
  length: number;
}) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.4, 0]} castShadow>
        <boxGeometry args={[0.45, 0.12, length]} />
        <meshStandardMaterial color={MAT.wood} />
      </mesh>
      <mesh position={[0, 0.2, -length / 2 + 0.1]}>
        <boxGeometry args={[0.4, 0.4, 0.08]} />
        <meshStandardMaterial color={MAT.metal} />
      </mesh>
      <mesh position={[0, 0.2, length / 2 - 0.1]}>
        <boxGeometry args={[0.4, 0.4, 0.08]} />
        <meshStandardMaterial color={MAT.metal} />
      </mesh>
    </group>
  );
}

/**
 * Mobiliario distintivo por templateKey (no solo categoría).
 * Habitación ≠ bar pileta ≠ lobby ≠ aula.
 */
export function TypologyFurniture({
  templateKey,
  category,
  widthM,
  depthM,
  heightM = 2.7,
}: {
  templateKey: string;
  category: string;
  widthM: number;
  depthM: number;
  heightM?: number;
}) {
  if (templateKey.includes("huddle")) {
    return <VideoconferenceFurniture widthM={widthM} depthM={depthM} size="S" />;
  }
  if (
    category === "videoconference" &&
    (templateKey.includes("boardroom-l") || templateKey.endsWith("-l"))
  ) {
    return <VideoconferenceFurniture widthM={widthM} depthM={depthM} size="L" />;
  }
  if (category === "videoconference") {
    return <VideoconferenceFurniture widthM={widthM} depthM={depthM} size="M" />;
  }
  if (templateKey === "classroom-m" || category === "classroom") {
    return <ClassroomFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "training-l" || category === "training") {
    return <TrainingFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "hotel-guest-s") {
    return (
      <HotelGuestFurniture
        widthM={widthM}
        depthM={depthM}
        heightM={heightM}
      />
    );
  }
  if (templateKey === "hotel-suite-m") {
    return <HotelSuiteFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "hotel-pool-bar-m") {
    return <HotelPoolBarFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "hotel-common-m") {
    return <HotelCommonFurniture widthM={widthM} depthM={depthM} />;
  }
  if (category === "hotel") {
    return (
      <HotelGuestFurniture
        widthM={widthM}
        depthM={depthM}
        heightM={heightM}
      />
    );
  }
  if (templateKey === "lobby-m" || category === "lobby") {
    return <LobbyFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "event-banquet-l" || category === "event") {
    return <EventFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "residential-living-m" || category === "residential") {
    return <ResidentialFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "control-room-m" || category === "control-room") {
    return <ControlRoomFurniture widthM={widthM} depthM={depthM} />;
  }
  if (templateKey === "signage-corridor-s" || category === "signage") {
    return <SignageCorridorFurniture widthM={widthM} depthM={depthM} />;
  }
  return <VideoconferenceFurniture widthM={widthM} depthM={depthM} size="M" />;
}
