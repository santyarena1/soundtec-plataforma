// Banco local (no se commitea): contorno leído de un recuadro del plano.
import sharp from "sharp";
import { planInkGrid } from "@/services/room-builder/plan-segment";
import { footprintPolygon } from "@/services/room-builder/plan-shape";

(async () => {
  const [file, bx] = process.argv.slice(2) as [string, string];
  const box = JSON.parse(bx) as { x0: number; y0: number; x1: number; y1: number };
  const webp = await sharp(file).flatten({ background: "#fff" }).webp({ quality: 82 }).toBuffer();
  const g = await sharp(webp).greyscale().raw().toBuffer({ resolveWithObject: true });
  const ink = planInkGrid({ data: new Uint8Array(g.data), width: g.info.width, height: g.info.height });
  const x0 = Math.floor(box.x0 * ink.width) - 1;
  const x1 = Math.ceil(box.x1 * ink.width);
  const y0 = Math.floor(box.y0 * ink.height) - 1;
  const y1 = Math.ceil(box.y1 * ink.height);
  for (let y = y0; y <= y1; y += 2) {
    let row = "";
    for (let x = x0; x <= x1; x++) row += ink.ink[y * ink.width + x] ? "#" : ".";
    console.log(row);
  }
  console.log(JSON.stringify(footprintPolygon(box, ink.ink, ink.width, ink.height)));
})();
