/**
 * La red de puntos y líneas finas del fondo de los formularios (azul Soundtec)
 * como SVG: la usan el encabezado del mail y la imagen de vista previa de los
 * enlaces (WhatsApp, redes). Con semilla: el mismo formulario da siempre el
 * mismo dibujo, así las imágenes se pueden cachear.
 */

const BLUE = "#2f6fd6";

function seeded(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1);
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61);
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296;
  };
}

export function networkSvg(options: { width: number; height: number; points: number; seed: string; linkDistance?: number }): string {
  const { width, height, points, seed } = options;
  const linkDistance = options.linkDistance ?? 175;
  const rand = seeded(seed);
  const pts = Array.from({ length: points }, () => ({ x: rand() * width, y: rand() * height, r: 2 + rand() * 1.8 }));
  const lines: string[] = [];
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      const d = Math.hypot(pts[i]!.x - pts[j]!.x, pts[i]!.y - pts[j]!.y);
      if (d > linkDistance) continue;
      lines.push(
        `<line x1="${pts[i]!.x.toFixed(1)}" y1="${pts[i]!.y.toFixed(1)}" x2="${pts[j]!.x.toFixed(1)}" y2="${pts[j]!.y.toFixed(1)}" stroke="${BLUE}" stroke-opacity="${((1 - d / linkDistance) * 0.3).toFixed(3)}" stroke-width="1.6"/>`
      );
    }
  }
  const dots = pts.map((p) => `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.r.toFixed(1)}" fill="${BLUE}" fill-opacity="0.5"/>`).join("");
  // Velo blanco al centro: lo que va encima (logo, títulos) se lee limpio sobre la red.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">
<defs><radialGradient id="veil" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff" stop-opacity="0.96"/><stop offset="0.55" stop-color="#fff" stop-opacity="0.85"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>
<rect width="100%" height="100%" fill="#ffffff"/>${lines.join("")}${dots}
<ellipse cx="${width / 2}" cy="${height / 2}" rx="${width * 0.42}" ry="${height * 0.52}" fill="url(#veil)"/></svg>`;
}
