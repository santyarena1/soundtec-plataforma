// Banco local (no se commitea): dibuja ambientes (azul) y objetos detectados (rojo) sobre el plano.
import sharp from "sharp";
import { planInkGrid, segmentRegions } from "@/services/room-builder/plan-segment";
import { boxToPolygon } from "@/services/room-builder/plan-polygon";
import { extractRoomObjects } from "@/services/room-builder/plan-objects";

(async () => {
  const [file, mw, out] = process.argv.slice(2) as [string, string, string];
  const webp = await sharp(file).flatten({ background: "#fff" }).webp({ quality: 82 }).toBuffer();
  const g = await sharp(webp).greyscale().raw().toBuffer({ resolveWithObject: true });
  const img = { data: new Uint8Array(g.data), width: g.info.width, height: g.info.height };
  const { regions } = segmentRegions(img);
  const ink = planInkGrid(img);
  const cellM = (Number(mw) / g.info.width) * (g.info.width / ink.width);
  const W = g.info.width;
  const H = g.info.height;
  let svg = "";
  for (const r of regions) {
    const poly = r.polygon ?? boxToPolygon(r.box);
    svg += `<polygon points="${poly.map((p) => `${p.x * W},${p.y * H}`).join(" ")}" fill="rgba(0,120,255,0.08)" stroke="#06f" stroke-width="3"/>`;
    const objs = extractRoomObjects(ink.ink, ink.width, ink.height, poly, cellM);
    console.log("ambiente", r.label, JSON.stringify(r.box), "objetos", objs.length);
    for (const o of objs) svg += `<rect x="${o.box.x0 * W}" y="${o.box.y0 * H}" width="${(o.box.x1 - o.box.x0) * W}" height="${(o.box.y1 - o.box.y0) * H}" fill="none" stroke="#e11d48" stroke-width="2"/>`;
  }
  await sharp(webp).composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">${svg}</svg>`) }]).png().toFile(out);
})();
