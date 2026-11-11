"use client";

import { useEffect, useRef } from "react";

/** Cantidad por cada 100.000 px² de pantalla (≈ 55 en una notebook, ≈ 15 en un celular). */
const DENSITY = 4.5;
const MAX_PARTICLES = 80;
const SPEED = 0.18;
/** Distancia máxima (px) a la que dos puntos se unen con una línea. */
const LINK_DISTANCE = 150;

type Particle = { x: number; y: number; vx: number; vy: number; r: number };

/**
 * Fondo tipo red en el azul Soundtec: puntos chicos que se mueven despacio y se
 * unen con líneas finas cuando están cerca (más tenues cuanto más lejos).
 * Queda quieta si la persona pidió reducir el movimiento.
 */
export function FormParticles({ dark }: { dark: boolean }) {
  const ref = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const color = dark ? "127, 176, 255" : "47, 111, 214";
    const dotAlpha = dark ? 0.55 : 0.45;
    const lineAlpha = dark ? 0.28 : 0.2;
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
      particles = Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2;
        const speed = SPEED * (0.4 + Math.random() * 0.6);
        return { x: Math.random() * width, y: Math.random() * height, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 1 + Math.random() * 0.9 };
      });
    };

    const step = () => {
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0 || p.x > width) p.vx *= -1;
        if (p.y < 0 || p.y > height) p.vy *= -1;
      }
    };

    const draw = () => {
      if (!still) step();
      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 0.8;
      for (let i = 0; i < particles.length; i++) {
        const a = particles[i];
        for (let j = i + 1; j < particles.length; j++) {
          const b = particles[j];
          const dist = Math.hypot(a.x - b.x, a.y - b.y);
          if (dist > LINK_DISTANCE) continue;
          ctx.strokeStyle = `rgba(${color}, ${((1 - dist / LINK_DISTANCE) * lineAlpha).toFixed(3)})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
      ctx.fillStyle = `rgba(${color}, ${dotAlpha})`;
      for (const p of particles) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!still) frame = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    const onResize = () => {
      window.cancelAnimationFrame(frame);
      resize();
      draw();
    };
    window.addEventListener("resize", onResize);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
    };
  }, [dark]);

  return <canvas ref={ref} aria-hidden className="pointer-events-none fixed inset-0 z-0 h-full w-full" />;
}
