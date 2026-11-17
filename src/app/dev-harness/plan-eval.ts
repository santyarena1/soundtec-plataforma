// Banco local (no se commitea): corre el armado de muebles del plano con un
// oráculo en vez de la IA y mide contra la respuesta correcta.
// npx tsx src/app/dev-harness/plan-eval.ts <plano.png> <respuesta.json> <nombre>
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { furnitureFromPlan, planInk, type PlanObjectClassifier } from "@/server/room-builder/plan-furniture";
import { segmentRegions } from "@/services/room-builder/plan-segment";
import { boxToPolygon } from "@/services/room-builder/plan-polygon";
import { planUnderlayFor, polygonBox, polygonToRoomMeters } from "@/services/room-builder/plan-polygon";
import type { FurnitureItem } from "@/services/room-builder/furnishing";

type Box = { x0: number; y0: number; x1: number; y1: number };
type Truth = { kind: string; facing: "up" | "down" | "left" | "right"; box: Box };

const PUBLIC = path.join(process.cwd(), "public", "dev-harness");

function oracle(truth: Truth[]): PlanObjectClassifier {
  return async (_room, crops, _roomUrl, where) => {
    if (!where) return crops.map(() => null);
    const used = new Set<number>();
    return where.boxes.map((ob, i) => {
      const rect = where.rects[i]!;
      const cw = rect.x1 - rect.x0;
      const ch = rect.y1 - rect.y0;
      const items = truth
        .map((t, k) => ({ t, k }))
        .filter(({ t, k }) => {
          const cx = (t.box.x0 + t.box.x1) / 2;
          const cy = (t.box.y0 + t.box.y1) / 2;
          return !used.has(k) && cx >= ob.x0 && cx <= ob.x1 && cy >= ob.y0 && cy <= ob.y1;
        });
      items.forEach(({ k }) => used.add(k));
      if (process.env.EVALDBG) console.log("   obj", i, JSON.stringify(ob).slice(0, 90), "->", items.map(({ t }) => t.kind).join(",") || "-");
      if (!items.length) return [{ kind: "other" as const, facing: "down" as const, box: { x0: 0, y0: 0, x1: 1, y1: 1 } }];
      return items.map(({ t }) => ({
        kind: t.kind as never,
        facing: t.facing,
        box: { x0: (t.box.x0 - rect.x0) / cw, y0: (t.box.y0 - rect.y0) / ch, x1: (t.box.x1 - rect.x0) / cw, y1: (t.box.y1 - rect.y0) / ch },
      }));
    });
  };
}

async function main() {
  const [file, truthFile, name] = process.argv.slice(2) as [string, string, string];
  const { metersWide, items: truth } = JSON.parse(fs.readFileSync(truthFile, "utf8")) as { metersWide: number; items: Truth[] };
  const webp = await sharp(file).flatten({ background: "#fff" }).webp({ quality: 82 }).toBuffer();
  const meta = await sharp(webp).metadata();
  const image = { data: webp, widthPx: meta.width!, heightPx: meta.height! };
  const g = await sharp(webp).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { regions } = segmentRegions({ data: new Uint8Array(g.data), width: g.info.width, height: g.info.height });
  const ink = await planInk(image);
  const mpp = metersWide / image.widthPx;
  fs.mkdirSync(PUBLIC, { recursive: true });
  fs.copyFileSync(file, path.join(PUBLIC, `${name}.png`));
  const rooms = [];
  for (const r of regions) {
    const poly = r.polygon ?? boxToPolygon(r.box);
    const box = polygonBox(poly);
    const widthM = (box.x1 - box.x0) * image.widthPx * mpp;
    const depthM = (box.y1 - box.y0) * image.heightPx * mpp;
    if (widthM * depthM < 6) continue;
    const map = planUnderlayFor(box, widthM, depthM, { url: `/dev-harness/${name}.png`, widthPx: image.widthPx, heightPx: image.heightPx });
    const furniture: FurnitureItem[] = await furnitureFromPlan({
      image,
      ink,
      polygon: poly,
      roomName: "sala",
      category: "residential",
      templateKey: "residential-living-m",
      map,
      classify: oracle(truth),
    });
    const inRoom = truth.filter((t) => {
      const cx = (t.box.x0 + t.box.x1) / 2;
      const cy = (t.box.y0 + t.box.y1) / 2;
      return cx >= box.x0 && cx <= box.x1 && cy >= box.y0 && cy <= box.y1;
    });
    console.log(`\nambiente ${widthM.toFixed(1)}×${depthM.toFixed(1)} m — esperado ${inRoom.length}: ${inRoom.map((t) => t.kind).join(", ")}`);
    for (const f of furniture) {
      console.log(`  ${f.kind.padEnd(16)} (${f.x.toFixed(2)}, ${f.z.toFixed(2)}) ${f.w}×${f.d} rot ${(f.rotY * 57.3).toFixed(0)} forma ${f.shape?.length ?? 0} respaldo ${JSON.stringify(f.backEdges ?? null)}`);
    }
    rooms.push({ widthM, depthM, floor: polygonToRoomMeters(poly, widthM, depthM), underlay: map, furniture });
  }
  fs.writeFileSync(path.join(PUBLIC, `${name}.json`), JSON.stringify({ rooms }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
