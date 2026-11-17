// Banco local (no se commitea): cuánta tinta cae dentro de cada ambiente.
import sharp from "sharp";
import { planInkGrid, segmentRegions } from "@/services/room-builder/plan-segment";
import { boxToPolygon } from "@/services/room-builder/plan-polygon";
import { pointInPolygon } from "@/services/room-builder/plan-polygon";

(async () => {
  const [file] = process.argv.slice(2) as [string];
  const webp = await sharp(file).flatten({ background: "#fff" }).webp({ quality: 82 }).toBuffer();
  const g = await sharp(webp).greyscale().raw().toBuffer({ resolveWithObject: true });
  const img = { data: new Uint8Array(g.data), width: g.info.width, height: g.info.height };
  const { regions } = segmentRegions(img);
  const ink = planInkGrid(img);
  console.log("grilla", ink.width, ink.height, "imagen", g.info.width, g.info.height);
  for (const r of regions) {
    const poly = r.polygon ?? boxToPolygon(r.box);
    let n = 0;
    let inside = 0;
    for (let y = 0; y < ink.height; y++)
      for (let x = 0; x < ink.width; x++) {
        if (!pointInPolygon({ x: (x + 0.5) / ink.width, y: (y + 0.5) / ink.height }, poly)) continue;
        inside++;
        if (ink.ink[y * ink.width + x]) n++;
      }
    console.log("ambiente", r.label, "celdas", inside, "con tinta", n, "vértices", poly.length, JSON.stringify(poly.slice(0, 6)));
  }
})();
