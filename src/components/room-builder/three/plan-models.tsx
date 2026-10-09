"use client";

/**
 * Muebles armados sobre la forma real dibujada en el plano: sillones en L o
 * rectos con respaldo, apoyabrazos y almohadones; mostradores y mesadas con
 * zócalo y tapa de piedra; mesas, alfombras, bancos, puffs, jardineras y
 * plantas en maceta (modelos reales CC0 de Poly Haven sobre macetas variadas).
 *
 * Coordenadas: la forma viene en metros relativa al centro del mueble, con
 * x = x del mundo e y del plano = z del mundo.
 */

import { RoundedBox } from "@react-three/drei";
import { useEffect, useMemo, type ReactNode } from "react";
import * as THREE from "three";
import type { PlanPoint } from "@/services/room-builder/plan-polygon";
import { armEdges, insetPolygon, inwardNormal, isRoundish, seatCushions } from "@/services/room-builder/plan-shape";
import { MAT } from "../room-theme";
import { MODELS, ModelOr } from "./models";
import { useSurface } from "./surfaces";

type Shape = PlanPoint[];

/* ── Geometría base ── */

/** Prisma vertical sobre un polígono, de y0 a y0 + height, con canto redondeado opcional. */
function Prism({ poly, y0, height, material, bevel = 0 }: { poly: Shape; y0: number; height: number; material: THREE.Material; bevel?: number }) {
  const geometry = useMemo(() => {
    const base = bevel > 0 ? insetPolygon(poly, poly.map(() => bevel)) : poly;
    if (base.length < 3) return null;
    let contour = base.map((p) => new THREE.Vector2(p.x, -p.y));
    if (THREE.ShapeUtils.isClockWise(contour)) contour = [...contour].reverse();
    return new THREE.ExtrudeGeometry(new THREE.Shape(contour), {
      depth: Math.max(0.001, height - 2 * bevel),
      bevelEnabled: bevel > 0,
      bevelThickness: bevel,
      bevelSize: bevel,
      bevelSegments: 3,
      curveSegments: 24,
    });
  }, [poly, height, bevel]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return <mesh geometry={geometry} material={material} rotation={[-Math.PI / 2, 0, 0]} position={[0, y0 + bevel, 0]} castShadow receiveShadow />;
}

/** Marco de un lado del polígono: centro, giro, largo y hacia qué lado (z local) queda el interior. */
function edgeFrame(poly: Shape, i: number) {
  const p = poly[i]!;
  const q = poly[(i + 1) % poly.length]!;
  const theta = Math.atan2(-(q.y - p.y), q.x - p.x);
  const n = inwardNormal(poly, i);
  // El eje z local, girado θ, apunta a (sin θ, cos θ): el interior está en z positivo o negativo.
  const inward = Math.sin(theta) * n.x + Math.cos(theta) * n.y > 0 ? 1 : -1;
  return { mid: { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }, theta, len: Math.hypot(q.x - p.x, q.y - p.y), inward };
}

/** Contenido alineado a un lado: x local a lo largo del lado, z local hacia adentro (multiplicar por `inward`). */
function AlongEdge({ poly, edge, children }: { poly: Shape; edge: number; children: (f: ReturnType<typeof edgeFrame>) => ReactNode }) {
  const f = edgeFrame(poly, edge);
  return (
    <group position={[f.mid.x, 0, f.mid.y]} rotation={[0, f.theta, 0]}>
      {children(f)}
    </group>
  );
}

function rectShape(w: number, d: number): Shape {
  return [
    { x: -w / 2, y: -d / 2 },
    { x: w / 2, y: -d / 2 },
    { x: w / 2, y: d / 2 },
    { x: -w / 2, y: d / 2 },
  ];
}

const inset = (poly: Shape, d: number) => insetPolygon(poly, poly.map(() => d));

/* ── Sillones ── */

const SOFA_PLINTH = 0.08;
const SOFA_BODY_TOP = 0.38;
const SEAT_CUSHION_H = 0.11;
const BACK_D = 0.2;
const BACK_H = 0.8;
const ARM_W = 0.17;
const ARM_H = 0.62;
const BACK_CUSHION_T = 0.17;
const BACK_CUSHION_H = 0.4;
const BACK_TILT = 0.14;
const FRONT_GAP = 0.02;
/** Telas de tapizado (tonos neutros de showroom). */
const UPHOLSTERY = ["#f3ede3", "#cdd2d8", "#efe6d6", "#c3cbbf"];

/** Sillón sobre su forma (recto o en L): base, respaldo en los lados de atrás, apoyabrazos en los extremos y almohadones. */
export function ShapedSofa({ shape, backEdges = [], color }: { shape: Shape; backEdges?: number[]; color?: string }) {
  const fabric = useSurface(MAT.fabric, undefined, undefined, color ?? UPHOLSTERY[0]);
  const plinth = useSurface(MAT.woodDark);
  const arms = armEdges(shape, backEdges);
  const seat = insetPolygon(
    shape,
    shape.map((_, i) => (backEdges.includes(i) ? BACK_D : arms.includes(i) ? ARM_W : FRONT_GAP)),
  );
  const cushions = seatCushions(seat);
  const n = shape.length;
  const trimFor = (j: number, atStart: boolean) => {
    if (backEdges.includes(j)) return atStart ? BACK_D + BACK_CUSHION_T : BACK_D;
    if (arms.includes(j)) return ARM_W;
    return FRONT_GAP;
  };

  return (
    <group>
      <Prism poly={inset(shape, 0.04)} y0={0} height={SOFA_PLINTH} material={plinth} />
      <Prism poly={shape} y0={SOFA_PLINTH} height={SOFA_BODY_TOP - SOFA_PLINTH} material={fabric} bevel={0.02} />
      {cushions ? (
        cushions.map((c, k) => (
          <RoundedBox
            key={`seat-${k}`}
            args={[c.x1 - c.x0 - 0.012, SEAT_CUSHION_H, c.y1 - c.y0 - 0.012]}
            radius={0.04}
            smoothness={4}
            position={[(c.x0 + c.x1) / 2, SOFA_BODY_TOP + SEAT_CUSHION_H / 2, (c.y0 + c.y1) / 2]}
            material={fabric}
            castShadow
            receiveShadow
          />
        ))
      ) : (
        <Prism poly={seat} y0={SOFA_BODY_TOP} height={SEAT_CUSHION_H} material={fabric} bevel={0.035} />
      )}
      {backEdges.map((i) => (
        <AlongEdge key={`back-${i}`} poly={shape} edge={i}>
          {(f) => {
            const start = trimFor((i - 1 + n) % n, true);
            const end = trimFor((i + 1) % n, false);
            const usable = f.len - start - end;
            const pieces = Math.max(1, Math.round(usable / 0.8));
            const piece = usable / pieces;
            return (
              <>
                <RoundedBox
                  args={[f.len, BACK_H - SOFA_PLINTH, BACK_D]}
                  radius={0.04}
                  smoothness={4}
                  position={[0, SOFA_PLINTH + (BACK_H - SOFA_PLINTH) / 2, (f.inward * BACK_D) / 2]}
                  material={fabric}
                  castShadow
                  receiveShadow
                />
                {usable > 0.3
                  ? Array.from({ length: pieces }, (_, k) => (
                      <RoundedBox
                        key={k}
                        args={[piece - 0.02, BACK_CUSHION_H, BACK_CUSHION_T]}
                        radius={0.05}
                        smoothness={4}
                        position={[-f.len / 2 + start + piece * (k + 0.5), SOFA_BODY_TOP + SEAT_CUSHION_H + BACK_CUSHION_H / 2 - 0.02, f.inward * (BACK_D + BACK_CUSHION_T / 2 - 0.03)]}
                        rotation={[-f.inward * BACK_TILT, 0, 0]}
                        material={fabric}
                        castShadow
                        receiveShadow
                      />
                    ))
                  : null}
              </>
            );
          }}
        </AlongEdge>
      ))}
      {arms.map((i) => (
        <AlongEdge key={`arm-${i}`} poly={shape} edge={i}>
          {(f) => (
            <RoundedBox
              args={[f.len, ARM_H - SOFA_PLINTH, ARM_W]}
              radius={0.05}
              smoothness={4}
              position={[0, SOFA_PLINTH + (ARM_H - SOFA_PLINTH) / 2, (f.inward * ARM_W) / 2]}
              material={fabric}
              castShadow
              receiveShadow
            />
          )}
        </AlongEdge>
      ))}
    </group>
  );
}

/** Puff: redondo o rectangular, tapizado. */
export function Ottoman({ w, d, variant = 0 }: { w: number; d: number; variant?: number }) {
  const fabric = useSurface(MAT.fabric, undefined, undefined, UPHOLSTERY[variant % UPHOLSTERY.length]);
  const h = 0.42;
  if (Math.abs(w - d) < 0.15 * Math.max(w, d)) {
    const r = Math.min(w, d) / 2;
    return (
      <mesh position={[0, h / 2, 0]} material={fabric} castShadow receiveShadow>
        <cylinderGeometry args={[r, r * 0.96, h, 40]} />
      </mesh>
    );
  }
  return <RoundedBox args={[w, h, d]} radius={0.05} smoothness={4} position={[0, h / 2, 0]} material={fabric} castShadow receiveShadow />;
}

/* ── Mostradores, mesadas y mesas ── */

const QUARTZ = "#ebe8e3";

/** Mostrador o mesada sobre su forma: zócalo, frente, luz bajo la tapa (mostrador) y tapa de piedra con vuelo. */
export function ShapedCounter({ shape, kitchen = false }: { shape: Shape; kitchen?: boolean }) {
  const height = kitchen ? 0.9 : 1.05;
  const body = useSurface(kitchen ? MAT.white : MAT.woodDark);
  // Piedra clara (cuarzo) lisa, con brillo suave.
  const top = useSurface(QUARTZ, 0.22, 0);
  const kick = useSurface(MAT.black);
  const led = useMemo(() => new THREE.MeshStandardMaterial({ color: "#fff1d6", emissive: "#ffd9a0", emissiveIntensity: 1.6 }), []);
  useEffect(() => () => led.dispose(), [led]);
  return (
    <group>
      <Prism poly={inset(shape, 0.06)} y0={0} height={0.1} material={kick} />
      <Prism poly={inset(shape, 0.015)} y0={0.1} height={height - 0.14} material={body} bevel={0.006} />
      {kitchen ? null : <Prism poly={inset(shape, 0.012)} y0={height - 0.055} height={0.012} material={led} />}
      <Prism poly={inset(shape, -0.025)} y0={height - 0.04} height={0.04} material={top} bevel={0.006} />
    </group>
  );
}

/** Mesa o escritorio sobre su forma: tapa de madera y patas en las esquinas. */
export function ShapedTable({ shape }: { shape: Shape }) {
  const wood = useSurface(MAT.wood);
  const metal = useSurface(MAT.metalDark);
  const legs = inset(shape, 0.07);
  return (
    <group>
      <Prism poly={shape} y0={0.72} height={0.035} material={wood} bevel={0.008} />
      {legs.map((p, i) => (
        <mesh key={i} position={[p.x, 0.36, p.y]} material={metal} castShadow>
          <boxGeometry args={[0.05, 0.72, 0.05]} />
        </mesh>
      ))}
    </group>
  );
}

/** Banco: asiento de madera sobre base metálica retirada. */
export function BenchSeat({ shape }: { shape: Shape }) {
  const wood = useSurface(MAT.wood);
  const metal = useSurface(MAT.black);
  return (
    <group>
      <Prism poly={inset(shape, 0.09)} y0={0} height={0.38} material={metal} />
      <Prism poly={shape} y0={0.38} height={0.06} material={wood} bevel={0.01} />
    </group>
  );
}

/** Mesa auxiliar (modelo real a la medida del plano). */
export function SideTable({ w, d }: { w: number; d: number }) {
  const s = Math.max(0.35, Math.min(w, d));
  return (
    <ModelOr
      url={MODELS.sideTable}
      fit={{ width: s, depth: s }}
      fallback={
        <mesh position={[0, 0.27, 0]} castShadow>
          <cylinderGeometry args={[s / 2, s / 2, 0.54, 32]} />
          <meshStandardMaterial color="#8b6b4e" roughness={0.6} />
        </mesh>
      }
    />
  );
}

/* ── Alfombras ── */

const RUG_TONES = ["#e6ddd0", "#c9d0d8", "#dccfbf", "#b9c2bb"];

export function Rug({ shape, variant = 0 }: { shape: Shape; variant?: number }) {
  const carpet = useSurface(MAT.carpet, undefined, undefined, RUG_TONES[variant % RUG_TONES.length]);
  if (isRoundish(shape)) {
    const xs = shape.map((p) => p.x);
    const ys = shape.map((p) => p.y);
    const r = (Math.max(...xs) - Math.min(...xs) + Math.max(...ys) - Math.min(...ys)) / 4;
    return (
      <mesh position={[0, 0.006, 0]} material={carpet} receiveShadow>
        <cylinderGeometry args={[r, r, 0.012, 64]} />
      </mesh>
    );
  }
  return <Prism poly={shape} y0={0} height={0.012} material={carpet} bevel={0.004} />;
}

/* ── Plantas ── */

/** Plantas sin maceta, de chica a grande (se apoyan sobre la tierra). */
const SMALL_PLANTS = [MODELS.plantCalathea, MODELS.plantAnthurium];
const SOIL = "#3a2c22";

type PotStyle = "ceramic" | "terracotta" | "matte" | "concrete";
const POT_STYLES: PotStyle[] = ["ceramic", "matte", "terracotta", "concrete"];

function Pot({ style, diameter, height }: { style: PotStyle; diameter: number; height: number }) {
  const ceramic = useSurface(MAT.white);
  const terracotta = useSurface("#b0623e", 0.9, 0);
  const matte = useSurface("#26272a", 0.85, 0);
  const concrete = useSurface(MAT.concrete);
  const soil = useSurface(SOIL, 1, 0);
  const r = diameter / 2;
  const body =
    style === "concrete" ? (
      <RoundedBox args={[diameter, height, diameter]} radius={0.015} smoothness={3} position={[0, height / 2, 0]} material={concrete} castShadow receiveShadow />
    ) : (
      <mesh position={[0, height / 2, 0]} material={style === "ceramic" ? ceramic : style === "terracotta" ? terracotta : matte} castShadow receiveShadow>
        <cylinderGeometry args={[r, style === "terracotta" ? r * 0.72 : style === "ceramic" ? r * 0.86 : r * 0.94, height, 48]} />
      </mesh>
    );
  return (
    <group>
      {body}
      {style === "terracotta" ? (
        <mesh position={[0, height - 0.02, 0]} material={terracotta} castShadow>
          <cylinderGeometry args={[r * 1.06, r * 1.06, 0.05, 48]} />
        </mesh>
      ) : null}
      <mesh position={[0, height - 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]} material={soil}>
        <circleGeometry args={[r * 0.93, 32]} />
      </mesh>
    </group>
  );
}

/** Follaje simple mientras carga el modelo real. */
function FoliageStandIn({ width, height }: { width: number; height: number }) {
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <sphereGeometry args={[width / 2, 16, 12]} />
      <meshStandardMaterial color="#4c6b3c" roughness={0.9} />
    </mesh>
  );
}

/**
 * Planta en maceta del tamaño del plano. La maceta varía (cerámica blanca,
 * negra mate, terracota, hormigón) y la especie según el tamaño: hojas bajas
 * para las chicas, helecho para las medianas, árbol (pachira) para las grandes.
 */
export function PottedPlant({ w, d, variant = 0, tree = false }: { w: number; d: number; variant?: number; tree?: boolean }) {
  const footprint = Math.min(tree ? 1.1 : 0.9, Math.max(0.3, Math.min(w, d)));
  const style = POT_STYLES[variant % POT_STYLES.length]!;
  const potD = footprint * (tree ? 0.62 : 0.7);
  const potH = potD * (style === "ceramic" ? 1.15 : style === "terracotta" ? 0.85 : 0.9);
  const big = tree || footprint >= 0.75;
  const url = big ? (footprint >= 0.85 ? MODELS.treePachiraTall : MODELS.treePachiraMedium) : footprint >= 0.5 ? MODELS.plantFern : SMALL_PLANTS[variant % SMALL_PLANTS.length]!;
  const plantW = footprint * (big ? 1.25 : 1.15);
  return (
    <group>
      <Pot style={style} diameter={potD} height={potH} />
      <ModelOr url={url} fit={{ width: plantW }} at={{ x: 0, z: 0, y: potH - 0.04, rotY: variant * 1.3 }} fallback={<group position={[0, potH, 0]}><FoliageStandIn width={plantW * 0.8} height={big ? 1.4 : 0.5} /></group>} />
    </group>
  );
}

/** Jardinera sobre su forma, con una fila de plantas a lo largo. */
export function PlanterBox({ shape, variant = 0 }: { shape: Shape; variant?: number }) {
  const box = useSurface(variant % 2 ? MAT.woodDark : MAT.concrete);
  const soil = useSurface(SOIL, 1, 0);
  const h = 0.48;
  const xs = shape.map((p) => p.x);
  const ys = shape.map((p) => p.y);
  const w = Math.max(...xs) - Math.min(...xs);
  const d = Math.max(...ys) - Math.min(...ys);
  const along = Math.max(w, d);
  const across = Math.min(w, d);
  const count = Math.max(1, Math.round(along / 0.42));
  const plantW = Math.min(0.65, Math.max(0.4, across * 1.5));
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2;
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
  return (
    <group>
      <Prism poly={shape} y0={0} height={h} material={box} bevel={0.008} />
      <Prism poly={inset(shape, 0.035)} y0={h - 0.03} height={0.02} material={soil} />
      {Array.from({ length: count }, (_, k) => {
        const t = -along / 2 + (along / count) * (k + 0.5);
        const x = w >= d ? Math.min(...xs) + along / 2 + t : cx;
        const z = w >= d ? cy : Math.min(...ys) + along / 2 + t;
        const url = [MODELS.plantFern, MODELS.plantCalathea, MODELS.plantAnthurium][(variant + k) % 3]!;
        return (
          <ModelOr key={k} url={url} fit={{ width: plantW }} at={{ x, z, y: h - 0.03, rotY: k * 2.1 }} fallback={<group position={[x, h, z]}><FoliageStandIn width={plantW * 0.8} height={0.4} /></group>} />
        );
      })}
    </group>
  );
}

export { rectShape };
