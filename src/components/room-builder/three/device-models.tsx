"use client";

/**
 * Modelos 3D de equipos por tipo, con medidas reales (la TV toma su pulgada
 * del proxyKey). Pantallas con contenido animado, LEDs que titilan. Se usan
 * cuando el producto no tiene un modelo 3D propio.
 */

import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useSurface } from "./surfaces";

/** Material de pantalla encendida: degradé que se mueve lento + "interfaz". */
function useScreenMaterial(variant: "tv" | "ui") {
  const mat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        toneMapped: false,
        uniforms: { uTime: { value: 0 }, uUi: { value: variant === "ui" ? 1 : 0 } },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
        `,
        fragmentShader: /* glsl */ `
          varying vec2 vUv;
          uniform float uTime;
          uniform float uUi;
          float box(vec2 p, vec2 b, float r) { vec2 q = abs(p) - b + r; return length(max(q, 0.0)) - r; }
          void main() {
            vec2 uv = vUv;
            float t = uTime * 0.12;
            vec3 a = vec3(0.05, 0.10, 0.24);
            vec3 b = vec3(0.10, 0.36, 0.62);
            vec3 c = vec3(0.55, 0.30, 0.70);
            float w1 = sin(uv.x * 3.0 + t * 2.0) * 0.5 + 0.5;
            float w2 = sin(uv.y * 4.0 - t * 1.3 + uv.x * 2.0) * 0.5 + 0.5;
            vec3 col = mix(a, b, w1 * 0.8);
            col = mix(col, c, w2 * 0.35);
            // brillo que recorre la pantalla
            col += 0.12 * smoothstep(0.35, 0.0, abs(uv.x - fract(t * 0.5) * 1.6 + 0.3));
            if (uUi > 0.5) {
              // grilla de "botones" tipo panel de control
              vec2 g = fract(uv * vec2(3.0, 2.0)) - 0.5;
              float d = box(g, vec2(0.36, 0.32), 0.08);
              col = mix(col, vec3(0.92, 0.95, 1.0) * 0.55, (1.0 - smoothstep(0.0, 0.01, d)) * 0.35);
            } else {
              // barra inferior tipo reproductor
              float bar = step(abs(uv.y - 0.1), 0.012) * step(0.1, uv.x) * step(uv.x, 0.1 + 0.8 * fract(t * 0.25));
              col += bar * 0.6;
            }
            gl_FragColor = vec4(col * 1.25, 1.0);
          }
        `,
      }),
    [variant],
  );
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
  });
  return mat;
}

/** Pulgadas a partir del proxyKey (tv_65 → 65). */
export function inchesFromProxy(proxyKey?: string | null): number {
  const m = /tv_(\d+)/.exec(proxyKey ?? "");
  return m ? Number(m[1]) : 65;
}

export function DisplayModel({ inches }: { inches: number }) {
  const diagM = inches * 0.0254;
  const width = diagM * 0.8716;
  const height = diagM * 0.4903;
  const bezel = 0.012;
  const body = useSurface("#16181c", 0.35, 0.5);
  const screen = useScreenMaterial("tv");
  return (
    <group>
      <mesh castShadow material={body}>
        <boxGeometry args={[width + bezel * 2, height + bezel * 2, 0.028]} />
      </mesh>
      {/* panel trasero más grueso (electrónica) */}
      <mesh position={[0, -height * 0.08, -0.03]} material={body}>
        <boxGeometry args={[width * 0.7, height * 0.6, 0.035]} />
      </mesh>
      <mesh position={[0, 0, 0.0145]} material={screen}>
        <planeGeometry args={[width, height]} />
      </mesh>
      {/* logo / LED de encendido */}
      <mesh position={[0, -height / 2 - bezel / 2, 0.0145]}>
        <circleGeometry args={[0.003, 12]} />
        <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
      </mesh>
    </group>
  );
}

function BlinkingLed({ position, color, speed = 1.6, phase = 0 }: { position: [number, number, number]; color: [number, number, number]; speed?: number; phase?: number }) {
  const ref = useRef<THREE.MeshBasicMaterial>(null);
  useFrame(({ clock: c }) => {
    if (!ref.current) return;
    const on = Math.sin(c.elapsedTime * speed + phase) > -0.3 ? 1 : 0.25;
    ref.current.color.setRGB(color[0] * on, color[1] * on, color[2] * on);
  });
  return (
    <mesh position={position}>
      <sphereGeometry args={[0.004, 10, 10]} />
      <meshBasicMaterial ref={ref} color={color} toneMapped={false} />
    </mesh>
  );
}

export function CameraModel() {
  const shell = useSurface("#e9ebee", 0.35, 0.1);
  const dark = useSurface("#1a1c20", 0.3, 0.4);
  const glass = useMemo(() => new THREE.MeshPhysicalMaterial({ color: "#0b1320", roughness: 0.05, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.02 }), []);
  const head = useRef<THREE.Group>(null);
  // La cámara "busca" muy despacio (paneo sutil).
  useFrame(({ clock: c }) => {
    if (head.current) head.current.rotation.y = Math.sin(c.elapsedTime * 0.25) * 0.35;
  });
  return (
    <group>
      <mesh castShadow material={shell} position={[0, -0.05, 0]}>
        <cylinderGeometry args={[0.07, 0.075, 0.04, 40]} />
      </mesh>
      <group ref={head}>
        <mesh castShadow material={shell} position={[0, 0.02, 0]}>
          <boxGeometry args={[0.13, 0.1, 0.11]} />
        </mesh>
        <mesh material={dark} position={[0, 0.02, 0.056]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.038, 0.04, 0.012, 40]} />
        </mesh>
        <mesh material={glass} position={[0, 0.02, 0.063]}>
          <sphereGeometry args={[0.03, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
        <BlinkingLed position={[0.05, 0.06, 0.056]} color={[3, 0.3, 0.3]} speed={1.1} />
      </group>
    </group>
  );
}

export function MicModel({ ceiling }: { ceiling: boolean }) {
  const white = useSurface("#eef0f2", 0.6, 0);
  const grille = useSurface("#d7dbe0", 0.8, 0.2);
  if (ceiling) {
    return (
      <group rotation={[Math.PI, 0, 0]}>
        <mesh castShadow material={white}>
          <boxGeometry args={[0.6, 0.03, 0.6]} />
        </mesh>
        <mesh position={[0, 0.016, 0]} rotation={[-Math.PI / 2, 0, 0]} material={grille}>
          <planeGeometry args={[0.56, 0.56]} />
        </mesh>
        <BlinkingLed position={[0.26, 0.018, 0.26]} color={[0.3, 2.5, 0.6]} speed={0.6} />
      </group>
    );
  }
  return (
    <group>
      <mesh castShadow material={white}>
        <cylinderGeometry args={[0.1, 0.11, 0.025, 48]} />
      </mesh>
      <mesh position={[0, 0.013, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.07, 0.08, 48]} />
        <meshBasicMaterial color={[0.3, 2.2, 0.8]} toneMapped={false} />
      </mesh>
    </group>
  );
}

export function SpeakerModel({ ceiling }: { ceiling: boolean }) {
  const trim = useSurface("#f4f5f7", 0.4, 0);
  const grille = useSurface("#e3e6ea", 0.75, 0.3);
  const cabinet = useSurface("#26292e", 0.6, 0.1);
  if (ceiling) {
    return (
      <group rotation={[Math.PI, 0, 0]}>
        <mesh material={trim}>
          <cylinderGeometry args={[0.13, 0.13, 0.012, 64]} />
        </mesh>
        <mesh position={[0, 0.007, 0]} rotation={[-Math.PI / 2, 0, 0]} material={grille}>
          <circleGeometry args={[0.115, 64]} />
        </mesh>
      </group>
    );
  }
  return (
    <group>
      <mesh castShadow material={cabinet}>
        <boxGeometry args={[0.18, 0.3, 0.17]} />
      </mesh>
      <mesh position={[0, 0, 0.0855]} material={grille}>
        <planeGeometry args={[0.16, 0.28]} />
      </mesh>
    </group>
  );
}

export function TouchModel({ onTable }: { onTable: boolean }) {
  const body = useSurface("#16181c", 0.3, 0.4);
  const base = useSurface("#9aa4b2", 0.3, 0.85);
  const screen = useScreenMaterial("ui");
  const w = 0.25;
  const h = 0.165;
  return (
    <group>
      <group rotation={[onTable ? -0.45 : 0, 0, 0]} position={[0, onTable ? 0.07 : 0, 0]}>
        <mesh castShadow material={body}>
          <boxGeometry args={[w + 0.02, h + 0.02, 0.015]} />
        </mesh>
        <mesh position={[0, 0, 0.0078]} material={screen}>
          <planeGeometry args={[w, h]} />
        </mesh>
      </group>
      {onTable ? (
        <mesh position={[0, 0.02, -0.03]} material={base} castShadow>
          <boxGeometry args={[0.16, 0.04, 0.1]} />
        </mesh>
      ) : null}
    </group>
  );
}

export function RackBoxModel({ tall }: { tall: boolean }) {
  const body = useSurface("#1d2025", 0.45, 0.6);
  const face = useSurface("#2a2e35", 0.35, 0.7);
  const h = tall ? 0.088 : 0.044;
  return (
    <group>
      <mesh castShadow material={body}>
        <boxGeometry args={[0.44, h, 0.3]} />
      </mesh>
      <mesh position={[0, 0, 0.151]} material={face}>
        <boxGeometry args={[0.48, h, 0.004]} />
      </mesh>
      {[0, 1, 2, 3].map((i) => (
        <BlinkingLed key={i} position={[-0.17 + i * 0.03, h * 0.2, 0.155]} color={i === 0 ? [0.4, 2.6, 0.6] : [0.4, 1.2, 3]} speed={2 + i * 0.7} phase={i} />
      ))}
    </group>
  );
}

export function GenericModel() {
  const mat = useSurface("#3b4552", 0.5, 0.4);
  return (
    <mesh castShadow material={mat}>
      <boxGeometry args={[0.2, 0.12, 0.16]} />
    </mesh>
  );
}
