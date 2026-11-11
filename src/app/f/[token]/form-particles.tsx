"use client";

import { useEffect, useRef } from "react";

/** Cantidad por cada 100.000 px² de pantalla (≈ 50 en una notebook, ≈ 15 en un celular). */
const DENSITY = 4;
const MAX_PARTICLES = 70;
const SPEED = 0.12;

type Particle = { x: number; y: number; r: number; vx: number; vy: number; alpha: number; phase: number };

/**
 * Fondo de partículas muy sutiles en el azul Soundtec: puntos chicos que flotan
 * despacio y titilan apenas. Quietas si la persona pidió reducir el movimiento.
 */
export function FormParticles({ dark }: { dark: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const color = dark ? "127, 176, 255" : "47, 111, 214";
    const maxAlpha = dark ? 0.4 : 0.38;
    let particles: Particle[] = [];
    let width = 0;
    let height = 0;
    let frame = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(MAX_PARTICLES, Math.round(((width * height) / 100_000) * DENSITY));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        r: 1 + Math.random() * 2.2,
        vx: (Math.random() - 0.5) * SPEED,
        vy: -SPEED * (0.3 + Math.random() * 0.7),
        alpha: 0.35 + Math.random() * 0.65,
        phase: Math.random() * Math.PI * 2,
      }));
    };

    const draw = (t: number) => {
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        if (!still) {
          p.x += p.vx;
          p.y += p.vy;
          if (p.y < -4) p.y = height + 4;
          if (p.x < -4) p.x = width + 4;
          if (p.x > width + 4) p.x = -4;
        }
        const twinkle = still ? 1 : 0.6 + 0.4 * Math.sin(t / 1800 + p.phase);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${color}, ${(p.alpha * twinkle * maxAlpha).toFixed(3)})`;
        ctx.fill();
      }
      if (!still) frame = window.requestAnimationFrame(draw);
    };

    resize();
    draw(0);
    const onResize = () => {
      resize();
      if (still) draw(0);
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [dark]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
