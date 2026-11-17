/**
 * Carga los videos tutoriales del portal (/portal/tutoriales).
 *
 * Lee la carpeta con los .mp4, sus miniaturas .jpg y videos.md (títulos,
 * duración, placa de título), deja los archivos donde se sirven y guarda la
 * lista en el AdminSetting «portal.tutorial_videos».
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/tutorial-videos-upload.ts --dir=<carpeta>            → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/tutorial-videos-upload.ts --dir=<carpeta> --apply    → aplica
 *
 * Dónde quedan los archivos (--target):
 *   public  → public/tutoriales/<slug>.mp4|jpg (van en el repo; hay que commitear y desplegar).
 *   blob    → Vercel Blob, tutoriales/<slug>-<hash>.mp4|jpg, servidos por /api/files (soporta Range).
 *             Necesita BLOB_READ_WRITE_TOKEN (en ENV_FILE o en BLOB_ENV_FILE; de ese archivo solo se
 *             toman BLOB_* y VERCEL_OIDC_TOKEN, nunca la base).
 *   Por defecto: blob si hay credenciales, si no public.
 *
 * Otras opciones: --reset-texts (pisa títulos/descripciones editados con los de videos.md).
 *
 * Idempotente: con los mismos archivos no sube nada nuevo; si un video cambió,
 * sube el nuevo, actualiza el setting y (en blob) borra el anterior.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function readEnvFile(file: string): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out.push([m[1]!, value]);
  }
  return out;
}

function loadEnv(file: string | undefined) {
  if (!file || !fs.existsSync(file)) throw new Error("Indicá ENV_FILE con la base a usar (ej. ENV_FILE=.env.devbranch).");
  for (const [k, v] of readEnvFile(file)) if (!process.env[k]) process.env[k] = v;
}

function loadBlobEnv(file: string | undefined) {
  if (!file) return;
  if (!fs.existsSync(file)) throw new Error(`No existe BLOB_ENV_FILE=${file}`);
  for (const [k, v] of readEnvFile(file)) {
    if ((k.startsWith("BLOB_") || k === "VERCEL_OIDC_TOKEN") && !process.env[k]) process.env[k] = v;
  }
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const sha8 = (buf: Buffer) => crypto.createHash("sha256").update(buf).digest("hex").slice(0, 10);
const contentTypeOf = (file: string) => (/\.mp4$/i.test(file) ? "video/mp4" : /\.png$/i.test(file) ? "image/png" : /\.webp$/i.test(file) ? "image/webp" : "image/jpeg");

async function main() {
  loadEnv(process.env.ENV_FILE);
  loadBlobEnv(process.env.BLOB_ENV_FILE);
  const apply = process.argv.includes("--apply");
  const resetTexts = process.argv.includes("--reset-texts");
  const dir = arg("dir") ?? process.env.VIDEOS_DIR;
  if (!dir || !fs.existsSync(path.join(dir, "videos.md"))) throw new Error("Indicá --dir=<carpeta> con los .mp4, las miniaturas y videos.md.");

  const { parseVideosMarkdown, parseTutorialVideos, mergeTutorialVideos, formatDuration, TUTORIAL_VIDEOS_SETTING } = await import("../src/lib/tutorial-videos");
  const { isBlobConfigured, blobAccess } = await import("../src/lib/blob-storage");
  const target = (arg("target") ?? (isBlobConfigured() ? "blob" : "public")) as "blob" | "public";
  if (target !== "blob" && target !== "public") throw new Error("--target tiene que ser blob o public.");
  if (target === "blob" && !isBlobConfigured()) throw new Error("--target=blob sin credenciales de Blob (BLOB_READ_WRITE_TOKEN).");

  const sources = parseVideosMarkdown(fs.readFileSync(path.join(dir, "videos.md"), "utf8"));
  if (sources.length === 0) throw new Error("videos.md no tiene videos (secciones «## NN · Título» con «Archivo: `x.mp4`»).");
  for (const s of sources) {
    if (!fs.existsSync(path.join(dir, s.videoFile))) throw new Error(`Falta ${s.videoFile} en ${dir}`);
    if (s.posterFile && !fs.existsSync(path.join(dir, s.posterFile))) throw new Error(`Falta ${s.posterFile} en ${dir}`);
  }

  const { prisma } = await import("../src/lib/prisma");
  const { getSetting, setSetting } = await import("../src/lib/settings");
  const previous = parseTutorialVideos(await getSetting(TUTORIAL_VIDEOS_SETTING, ""));
  const db = new URL(process.env.DATABASE_URL ?? "postgres://?").host;
  console.log(`Base: ${db} · destino de archivos: ${target}${target === "blob" ? ` (${blobAccess()})` : " (public/tutoriales)"} · ${apply ? "APLICA" : "dry-run"}`);
  console.log(`Videos en ${dir}: ${sources.length}. En el setting hoy: ${previous.length}.`);

  /** Sube/copia un archivo y devuelve su URL (no hace nada en dry-run). */
  async function place(file: string, slug: string): Promise<string> {
    const buf = fs.readFileSync(path.join(dir!, file));
    const hash = sha8(buf);
    const ext = path.extname(file).toLowerCase();
    if (target === "public") {
      const rel = `tutoriales/${slug}${ext}`;
      const dest = path.join(process.cwd(), "public", rel);
      const same = fs.existsSync(dest) && sha8(fs.readFileSync(dest)) === hash;
      if (apply && !same) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.copyFileSync(path.join(dir!, file), dest);
      }
      console.log(`  ${same ? "=" : "+"} public/${rel} (${(buf.length / 1048576).toFixed(1)} MB)`);
      return `/${rel}?v=${hash}`;
    }
    const { head, put } = await import("@vercel/blob");
    const pathname = `tutoriales/${slug}-${hash}${ext}`;
    const access = blobAccess();
    const exists = await head(pathname).then(() => true).catch(() => false);
    let url = access === "public" ? "" : `/api/files/${pathname}`;
    if (exists && access === "public") url = (await head(pathname)).url;
    if (!exists && apply) {
      const blob = await put(pathname, buf, { access, contentType: contentTypeOf(file), addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000 });
      if (access === "public") url = blob.url;
    }
    console.log(`  ${exists ? "=" : "+"} blob ${pathname} (${(buf.length / 1048576).toFixed(1)} MB)`);
    return url || `(se sube con --apply) ${pathname}`;
  }

  const placed: Array<(typeof sources)[number] & { videoUrl: string; posterUrl: string }> = [];
  for (const s of sources) {
    console.log(`${String(s.order).padStart(2, "0")} · ${s.title} · ${formatDuration(s.durationSeconds)}`);
    const videoUrl = await place(s.videoFile, s.slug);
    const posterUrl = s.posterFile ? await place(s.posterFile, s.slug) : "";
    placed.push({ ...s, videoUrl, posterUrl });
  }

  const next = mergeTutorialVideos(placed, previous, { resetTexts });
  const kept = next.filter((v, i) => v.title !== placed[i]!.title || v.description !== placed[i]!.description).length;
  if (kept) console.log(`Textos editados que se conservan: ${kept} (usá --reset-texts para volver a los de videos.md).`);

  if (!apply) {
    console.log("Dry-run: no se escribió nada. Agregá --apply para aplicar.");
  } else {
    await setSetting(TUTORIAL_VIDEOS_SETTING, JSON.stringify(next, null, 2), {
      description: "Videos tutoriales del portal (/portal/tutoriales). Título y descripción editables; archivos y duración los carga scripts/tutorial-videos-upload.ts.",
    });
    console.log(`Setting ${TUTORIAL_VIDEOS_SETTING} guardado con ${next.length} videos.`);

    if (target === "blob") {
      // Los archivos viejos que ya no usa nadie se borran del almacenamiento.
      const inUse = new Set(next.flatMap((v) => [v.videoUrl, v.posterUrl]));
      const stale = previous
        .flatMap((v) => [v.videoUrl, v.posterUrl])
        .filter((u) => u && !inUse.has(u) && /\/api\/files\/tutoriales\//.test(u))
        .map((u) => u.replace(/^.*\/api\/files\//, ""));
      if (stale.length) {
        const { del } = await import("@vercel/blob");
        await del(stale);
        console.log(`Borrados del almacenamiento: ${stale.length} archivos viejos.`);
      }
    } else {
      const keep = new Set(next.flatMap((v) => [v.videoUrl, v.posterUrl]).map((u) => u.replace(/^\/|\?.*$/g, "")));
      const folder = path.join(process.cwd(), "public", "tutoriales");
      for (const f of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
        if (!keep.has(`tutoriales/${f}`)) {
          fs.unlinkSync(path.join(folder, f));
          console.log(`  - public/tutoriales/${f} (ya no está en la lista)`);
        }
      }
      const total = fs.readdirSync(folder).reduce((acc, f) => acc + fs.statSync(path.join(folder, f)).size, 0);
      console.log(`public/tutoriales: ${(total / 1048576).toFixed(1)} MB. Commitear y desplegar para que se vean en producción.`);
    }
  }
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
