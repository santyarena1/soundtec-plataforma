/**
 * Plano o diagrama (SVG de las láminas) a PNG en el navegador, con una
 * cartela mínima abajo: logo y datos de la empresa, proyecto, sala, nombre
 * del dibujo, revisión vigente con su estado y fecha. Sin servidor ni
 * navegador headless: el SVG se dibuja en un canvas.
 */

export type PngCartela = {
  company: string;
  web: string;
  phone: string;
  logoUrl: string;
  color: string;
  project: string;
  client: string | null;
  room: string;
  title: string;
  revision: { code: string; status: string };
  date: string;
};

/** Píxeles por unidad del SVG: el plano viene en mm (≈ 200 dpi), el diagrama en px. */
const PX_PER_MM = 8;
const PX_PER_PX = 2;
/** Ancho máximo del PNG (los navegadores limitan el tamaño del canvas). */
const MAX_W = 4800;
const MAX_H = 4800;

function loadImage(src: string, cors = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // Logo de otro dominio: sin CORS no se carga (y no "ensucia" el canvas, que no se podría exportar).
    if (cors) img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo dibujar la imagen"));
    img.src = src;
  });
}

/** Tamaño de salida y SVG con ancho y alto en píxeles. */
function sizedSvg(svg: string): { svg: string; w: number; h: number } {
  const vb = /viewBox="([\d.\s-]+)"/.exec(svg)?.[1]?.trim().split(/\s+/).map(Number);
  const vw = vb?.[2] ?? 1000;
  const vh = vb?.[3] ?? 700;
  const inMm = /<svg[^>]*\swidth="[\d.]+mm"/.test(svg);
  let k = inMm ? PX_PER_MM : PX_PER_PX;
  k = Math.min(k, MAX_W / vw, MAX_H / vh);
  const w = Math.round(vw * k);
  const h = Math.round(vh * k);
  const root = svg.replace(/<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
  return { svg: root, w, h };
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > max) t = t.slice(0, -1);
  return `${t}…`;
}

export async function svgToPng(svg: string, c: PngCartela): Promise<Blob> {
  const { svg: sized, w, h } = sizedSvg(svg);
  const url = URL.createObjectURL(new Blob([sized], { type: "image/svg+xml;charset=utf-8" }));
  try {
    const drawing = await loadImage(url);
    const W = Math.max(w, 1200);
    const s = W / 1600; // escala de la cartela según el ancho
    const band = Math.round(150 * s);
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = h + band;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("El navegador no permite generar la imagen");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(drawing, Math.round((W - w) / 2), 0, w, h);

    // Cartela: franja con borde superior del color de la empresa.
    const y0 = h;
    ctx.fillStyle = c.color;
    ctx.fillRect(0, y0, W, Math.max(3, Math.round(5 * s)));
    ctx.strokeStyle = "#111827";
    ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
    const pad = Math.round(28 * s);
    let x = pad;
    const logo = c.logoUrl ? await loadImage(c.logoUrl, /^https?:\/\//i.test(c.logoUrl) && !c.logoUrl.startsWith(location.origin)).catch(() => null) : null;
    if (logo) {
      const lh = Math.round(64 * s);
      const lw = Math.min(Math.round(220 * s), (logo.width / logo.height) * lh);
      ctx.drawImage(logo, x, y0 + (band - lh) / 2, lw, lh);
      x += lw + pad;
    }
    ctx.fillStyle = "#111827";
    ctx.textBaseline = "middle";
    const font = (px: number, bold = false) => `${bold ? "700 " : ""}${Math.round(px * s)}px Arial, Helvetica, sans-serif`;
    const col = (W - x - pad) / 3;
    ctx.font = font(24, true);
    ctx.fillText(fitText(ctx, c.company, col - pad), x, y0 + band * 0.36);
    ctx.font = font(18);
    ctx.fillStyle = "#475569";
    ctx.fillText(fitText(ctx, [c.web, c.phone].filter(Boolean).join(" · "), col - pad), x, y0 + band * 0.66);

    const x2 = x + col;
    ctx.fillStyle = c.color;
    ctx.font = font(26, true);
    ctx.fillText(fitText(ctx, c.title, col - pad), x2, y0 + band * 0.3);
    ctx.fillStyle = "#111827";
    ctx.font = font(18);
    ctx.fillText(fitText(ctx, c.project + (c.client ? ` · ${c.client}` : ""), col - pad), x2, y0 + band * 0.56);
    ctx.fillStyle = "#475569";
    ctx.fillText(fitText(ctx, c.room, col - pad), x2, y0 + band * 0.78);

    const x3 = x + col * 2;
    ctx.fillStyle = "#111827";
    ctx.font = font(30, true);
    ctx.fillText(`Rev. ${c.revision.code}`, x3, y0 + band * 0.32);
    ctx.font = font(18, true);
    ctx.fillStyle = c.color;
    ctx.fillText(fitText(ctx, c.revision.status.toUpperCase(), col - pad), x3, y0 + band * 0.58);
    ctx.font = font(18);
    ctx.fillStyle = "#475569";
    ctx.fillText(c.date, x3, y0 + band * 0.8);
    ctx.beginPath();
    ctx.moveTo(x2 - pad / 2, y0 + band * 0.15);
    ctx.lineTo(x2 - pad / 2, y0 + band * 0.9);
    ctx.moveTo(x3 - pad / 2, y0 + band * 0.15);
    ctx.lineTo(x3 - pad / 2, y0 + band * 0.9);
    ctx.stroke();

    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("No se pudo generar el PNG"))), "image/png"));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** Datos de /exports?kind=drawings (panel) o /p/[token]/exportar?kind=drawings (cliente). */
export type DrawingsPayload = {
  project: string;
  client: string | null;
  revision: { code: string; status: string };
  date: string;
  brand: { name: string; web: string; phone: string; logoUrl: string; color: string };
  rooms: Array<{ id: string; name: string; planSvg: string | null; diagramSvg: string | null }>;
};

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\w\-]+/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "") || "sala";

/** Baja un PNG por ambiente del plano o del diagrama. Devuelve cuántos generó. */
export async function downloadDrawingPngs(endpoint: string, kind: "plan" | "diagram"): Promise<number> {
  const res = await fetch(endpoint);
  const json = (await res.json().catch(() => null)) as (DrawingsPayload & { ok?: boolean; error?: string }) | null;
  if (!res.ok || !json?.ok) throw new Error(json?.error ?? "No se pudieron leer los dibujos");
  let n = 0;
  for (const r of json.rooms) {
    const svg = kind === "plan" ? r.planSvg : r.diagramSvg;
    if (!svg) continue;
    const title = kind === "plan" ? "Plano a escala" : "Diagrama de conexiones";
    const blob = await svgToPng(svg, {
      company: json.brand.name,
      web: json.brand.web,
      phone: json.brand.phone,
      logoUrl: json.brand.logoUrl,
      color: json.brand.color,
      project: json.project,
      client: json.client,
      room: r.name,
      title,
      revision: json.revision,
      date: json.date,
    });
    downloadBlob(blob, `${kind === "plan" ? "Plano" : "Diagrama"}_${slug(json.project)}_${slug(r.name)}.png`);
    n++;
  }
  return n;
}
