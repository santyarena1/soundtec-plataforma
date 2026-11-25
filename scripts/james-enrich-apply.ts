/**
 * Enriquecimiento de los productos JAMES (James Loudspeaker, de Sonance) para
 * que queden tan completos como el resto del catálogo: rubro, textos en
 * español (descripción, características y rótulos de la tabla de specs),
 * medidas reales, perfil del asistente, perfil de diseño (Room Builder),
 * perfil de conexiones con citas validadas y accesorios del portal.
 *
 * Los datos salen de las fichas oficiales (tabla del portal my.sonance.com y
 * PDF del fabricante) y están por SKU en scripts/data/james-enrich.json.
 *
 *   ENV_FILE=.env.devbranch npx tsx scripts/james-enrich-apply.ts              → dry-run (no escribe)
 *   ENV_FILE=.env.devbranch npx tsx scripts/james-enrich-apply.ts --apply      → aplica
 *   … --data=<archivo.json>   --out=<informe.json>   --sku=SA68,QX830   --no-io
 *
 * Idempotente y conservador ("no pisar datos mejores"):
 * - Solo toca productos de marca JAMES cuyo SKU está en el archivo (los que no
 *   existen en la base se informan y se saltean). Si la ficha dice otra marca
 *   (accesorio Sonance listado como JAMES), no se toca.
 * - Rubro, familia, medidas, diámetro de corte y U de rack: solo si están vacíos
 *   (o si las medidas son el relleno 1×1×1 del portal).
 * - Descripción larga y características: solo si están vacías. Descripción
 *   corta: solo si es la del portal (vacía, en inglés o en MAYÚSCULAS sin editar).
 * - Rótulos de specs en español: se agregan a las filas que no los tienen.
 * - Perfil del asistente: se crea si falta (no pisa uno hecho por el lector automático).
 * - Perfil de conexiones: no pisa uno aprobado, ni uno con más puertos, ni uno
 *   "auto" con un resultado que quede "needs_review" (guarda "pierde puertos").
 * - Accesorios: suma las relaciones que lista el portal; no borra ninguna.
 * Deja un JSON con el antes/después de cada producto (--out).
 */
import fs from "node:fs";
import path from "node:path";

type Dict = Record<string, string>;
type IoReading = { applies?: boolean; ports?: unknown[]; capabilities?: Record<string, unknown>; notes?: string | null; fetchUrls?: string[] };
type Entry = {
  sku: string;
  portalShortEs?: string | null;
  shortDescriptionEs?: string;
  longDescriptionEs?: string;
  keyFeaturesEs?: string[];
  categoryPath?: string;
  familyName?: string | null;
  ai?: Record<string, unknown>;
  dims?: { widthCm?: number | null; heightCm?: number | null; depthCm?: number | null; cutoutDiameterCm?: number | null; rackUnits?: number | null };
  io?: IoReading;
  accessorySkus?: string[];
};
type DataFile = { version: number; specI18n: { labels: Dict; values: Dict }; products: Record<string, Entry> };
type Log = { sku: string; productId?: string; result: string; changes: Record<string, { before: unknown; after: unknown }>; notes: string[] };

const DEFAULT_DATA = path.join(__dirname, "data", "james-enrich.json");
const JAMES = "JAMES";
const READER = "claude";
const MAX_FETCHED_CHARS = 60_000;

function loadEnv(file: string | undefined) {
  if (!file || !fs.existsSync(file)) throw new Error("Indicá ENV_FILE con la base a usar (ej. ENV_FILE=.env.devbranch).");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2]!;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!process.env[m[1]!]) process.env[m[1]!] = value;
  }
}

function args(argv: string[]) {
  const get = (k: string) => argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  return {
    apply: argv.includes("--apply"),
    noIo: argv.includes("--no-io"),
    data: get("data") ?? DEFAULT_DATA,
    out: get("out") ?? path.join(process.cwd(), `james-enrich-${argv.includes("--apply") ? "apply" : "dryrun"}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`),
    skus: get("sku")?.split(",").map((s) => s.trim()).filter(Boolean) ?? null,
  };
}

/** JSON con claves ordenadas (jsonb de Postgres reordena las claves). */
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.entries(x).filter(([, y]) => y !== undefined).sort(([a], [b]) => a.localeCompare(b))) : x));
const isEmpty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);
const num = (v: unknown) => (v == null ? null : Number(v));
const stripHtml = (s: string | null | undefined) => (s ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
/** Texto del portal/sync sin editar a mano: en MAYÚSCULAS (así llegan del portal). */
const looksLikePortalText = (s: string) => s === s.toUpperCase() && /[A-ZÁÉÍÓÚÑ]/.test(s);

type SpecRow = { label?: string; value?: string; labelEs?: string; valueEs?: string; [k: string]: unknown };

/** Agrega labelEs/valueEs a las filas que no los tienen. Devuelve null si no cambia nada. */
function translateSpecs(raw: unknown, i18n: DataFile["specI18n"]): SpecRow[] | null {
  if (!Array.isArray(raw)) return null;
  let changed = false;
  const out = raw.map((r: SpecRow) => {
    if (!r || typeof r !== "object" || r.labelEs) return r;
    const labelEs = r.label ? i18n.labels[r.label] : undefined;
    const valueEs = r.value ? i18n.values[r.value] : undefined;
    if (!labelEs && !valueEs) return r;
    changed = true;
    return { ...r, ...(labelEs ? { labelEs } : {}), ...(valueEs ? { valueEs } : {}) };
  });
  return changed ? out : null;
}

function englishSpecsText(raw: unknown): string {
  if (!Array.isArray(raw)) return "";
  return raw
    .filter((r: SpecRow) => r && r.label && r.value)
    .map((r: SpecRow) => `${r.label}: ${r.value}`)
    .join("\n");
}

function specBrand(raw: unknown): string | null {
  if (!Array.isArray(raw)) return null;
  const row = raw.find((r: SpecRow) => r?.label === "Product Brand") as SpecRow | undefined;
  return row?.value?.trim() || null;
}

async function main() {
  loadEnv(process.env.ENV_FILE);
  const opt = args(process.argv.slice(2));
  const data = JSON.parse(fs.readFileSync(opt.data, "utf8")) as DataFile;
  const { prisma } = await import("../src/lib/prisma");
  const { mergeFieldTimestamps, changedScalarFields } = await import("../src/lib/field-timestamps");
  const { isPlaceholderDimensions } = await import("../src/services/sync/dimensions");
  const profileSource = await import("../src/services/ai-assistant/profile/source");
  const profileExtract = await import("../src/services/ai-assistant/profile/extract");
  const profileBuild = await import("../src/services/ai-assistant/profile/build");
  const fromProduct = await import("../src/services/room-builder/from-product");
  const ioSource = await import("../src/services/room-builder/io-profile/source");
  const ioExtract = await import("../src/services/room-builder/io-profile/extract");
  const ioManual = await import("../src/services/room-builder/io-profile/manual");

  const skus = Object.keys(data.products).filter((s) => !opt.skus || opt.skus.includes(s));
  const categories = new Map(
    (await prisma.category.findMany({ where: { tangoPath: { not: null } }, select: { id: true, name: true, tangoPath: true } })).map((c) => [c.tangoPath!, c]),
  );
  const families = await prisma.productFamily.findMany({ select: { id: true, name: true } });
  const familyId = (name: string) => families.find((f) => f.name.toLowerCase() === name.toLowerCase())?.id ?? null;
  const textCache = new Map<string, string | null>();
  const fetchText = async (url: string) => {
    if (!textCache.has(url)) textCache.set(url, await ioSource.pageText(url).catch(() => null));
    return textCache.get(url) ?? null;
  };

  const logs: Log[] = [];
  const tally: Record<string, number> = {};
  const count = (k: string) => (tally[k] = (tally[k] ?? 0) + 1);
  const now = new Date();

  for (const sku of skus) {
    const e = data.products[sku]!;
    const log: Log = { sku, result: "", changes: {}, notes: [] };
    logs.push(log);
    const p = await prisma.product.findFirst({
      where: { supplierSku: sku, brand: { name: { equals: JAMES, mode: "insensitive" } } },
      include: {
        brand: { select: { name: true } },
        category: { select: { name: true } },
        family: { select: { name: true } },
        aiProfile: { select: { model: true, productType: true, embedding: true, sourceHash: true, summaryEs: true } },
        ioProfile: { select: { status: true, ports: true, capabilities: true, model: true } },
        designProfile: { select: { designRole: true, status: true } },
        accessories: { select: { accessoryProductId: true, kind: true } },
      },
    });
    if (!p) {
      log.result = "no existe en esta base (se saltea)";
      count("sin producto");
      continue;
    }
    log.productId = p.id;
    const brandInSpecs = specBrand(p.specifications);
    if (brandInSpecs && brandInSpecs.toUpperCase() !== JAMES) {
      log.result = `la ficha dice marca ${brandInSpecs}: no se toca`;
      count("otra marca");
      continue;
    }

    // ── 1. Campos del producto ────────────────────────────────────────────────
    const upd: Record<string, unknown> = {};
    const set = (field: string, before: unknown, after: unknown) => {
      upd[field] = after;
      log.changes[field] = { before, after };
    };
    let wroteSpanish = false;

    const rawShortEn = typeof (p.sourceMetadata as Record<string, unknown> | null)?.shortDescription === "string" ? String((p.sourceMetadata as Record<string, unknown>).shortDescription) : null;
    if (e.shortDescriptionEs && p.shortDescription !== e.shortDescriptionEs) {
      const cur = p.shortDescription ?? "";
      const replaceable = isEmpty(cur) || cur === rawShortEn || cur === e.portalShortEs || looksLikePortalText(cur);
      if (replaceable) {
        set("shortDescription", p.shortDescription, e.shortDescriptionEs);
        wroteSpanish = true;
      } else log.notes.push("descripción corta editada a mano: se conserva");
    }
    if (e.longDescriptionEs && p.longDescription !== e.longDescriptionEs) {
      // Vacía, o copia del HTML / del nombre del portal en inglés (no la escribió nadie).
      const curLong = stripHtml(p.longDescription);
      if (!curLong || curLong === stripHtml(p.htmlContent) || curLong.toUpperCase() === stripHtml(p.originalName).toUpperCase()) {
        set("longDescription", p.longDescription, e.longDescriptionEs);
        // Traducción de la ficha oficial (portal + PDF del fabricante): no es «Generado con IA».
        set("aiGeneratedDescription", p.aiGeneratedDescription, false);
        set("aiDescriptionFeedbackStatus", p.aiDescriptionFeedbackStatus, null);
        wroteSpanish = true;
      } else log.notes.push("ya tenía descripción larga: se conserva");
    }
    if (e.keyFeaturesEs?.length && isEmpty(p.keyFeatures)) {
      set("keyFeatures", p.keyFeatures, e.keyFeaturesEs);
      wroteSpanish = true;
    }
    const specsEs = translateSpecs(p.specifications, data.specI18n);
    if (specsEs) {
      upd.specifications = specsEs;
      log.changes.specifications = { before: "sin rótulos en español", after: `${specsEs.filter((s) => s.labelEs).length} filas con rótulo en español` };
      wroteSpanish = true;
    }
    if (wroteSpanish && !p.translatedAt) set("translatedAt", null, now);

    if (e.categoryPath && !p.categoryId) {
      const id = categories.get(e.categoryPath);
      if (id) set("categoryId", null, id.id);
      else log.notes.push(`rubro inexistente en esta base: ${e.categoryPath}`);
    }
    if (e.familyName && !p.familyId) {
      const id = familyId(e.familyName);
      if (id) set("familyId", null, id);
    }

    const cur = { widthCm: num(p.widthCm), heightCm: num(p.heightCm), depthCm: num(p.depthCm) };
    const dimsEmpty = cur.widthCm == null && cur.heightCm == null && cur.depthCm == null;
    // Medidas de la ficha: valen salvo que las tres sean ≤ 1 cm (forma del relleno del portal).
    const newDims = e.dims && !isPlaceholderDimensions(e.dims) ? e.dims : null;
    if (e.dims && (dimsEmpty || isPlaceholderDimensions(cur))) {
      for (const f of ["widthCm", "heightCm", "depthCm"] as const) {
        const v = newDims?.[f];
        if (v != null && v > 0) set(f, cur[f], v);
        else if (cur[f] != null) set(f, cur[f], null); // relleno 1×1×1 → sin dato
      }
    }
    if (e.dims?.cutoutDiameterCm != null && p.cutoutDiameterCm == null) set("cutoutDiameterCm", null, e.dims.cutoutDiameterCm);
    if (e.dims?.rackUnits != null && p.rackUnits == null) set("rackUnits", null, e.dims.rackUnits);

    const changedScalars = changedScalarFields(p as unknown as Record<string, unknown>, upd);
    if (Object.keys(upd).length) {
      upd.fieldUpdatedAt = mergeFieldTimestamps(p.fieldUpdatedAt, [...changedScalars, ...(upd.specifications ? ["specifications"] : []), ...(upd.keyFeatures ? ["keyFeatures"] : [])], now.toISOString());
      if (opt.apply) await prisma.product.update({ where: { id: p.id }, data: upd as never });
    }

    // Producto tal como queda (para armar los perfiles con el mismo texto que usa el sistema).
    const row = { ...p, ...upd, category: upd.categoryId ? { name: categories.get(e.categoryPath!)!.name } : p.category } as typeof p;

    // ── 2. Perfil del asistente (sin OpenAI: lo arma la lectura de la ficha) ──
    if (e.ai && (!p.aiProfile || p.aiProfile.model?.startsWith(ioManual.MANUAL_MODEL_PREFIX))) {
      const profile = profileExtract.normalizeExtraction(e.ai);
      if (!profile) log.notes.push("perfil del asistente inválido (resumen corto)");
      else {
        const source = profileSource.buildSource(row as never);
        const hard = source.hardFacts;
        const upToDate = p.aiProfile?.sourceHash === source.hash && p.aiProfile?.summaryEs === profile.summaryEs;
        // El montaje lo decide la lectura de la ficha; la regex solo completa si no hay (el raw del portal menciona otras series).
        const mountTypes = (profile.mountTypes.length ? profile.mountTypes : hard.mountTypes).slice(0, 6);
        const env = profileBuild.resolveEnvironment({ profile, ipRating: hard.ipRating, mountTypes });
        const aiData = {
          productType: profile.productType, ...env, ipRating: hard.ipRating, mountTypes,
          audioLine: hard.audioLine, powerWatts: hard.powerWatts, impedanceOhms: hard.impedanceOhms, hdmiInputs: hard.hdmiInputs,
          ecosystems: Array.from(new Set([...hard.ecosystems, ...profile.ecosystems])).slice(0, 10),
          applications: profile.applications, summaryEs: profile.summaryEs,
          searchTextEs: profileExtract.buildSearchText({ name: p.normalizedName, brandName: p.brand?.name ?? null, profile, ipRating: hard.ipRating, audioLine: hard.audioLine }),
          embedding: p.aiProfile?.embedding ?? [], sourceHash: source.hash, profileVersion: profileBuild.PROFILE_VERSION,
          model: `${ioManual.MANUAL_MODEL_PREFIX}${READER}`, builtAt: now,
        };
        if (!upToDate) log.changes.aiProfile = { before: p.aiProfile ? `${p.aiProfile.productType} (${p.aiProfile.model})` : null, after: `${aiData.productType} · ${aiData.environment} · ${mountTypes.join(",")}` };
        if (opt.apply && !upToDate) await prisma.productAiProfile.upsert({ where: { productId: p.id }, create: { productId: p.id, ...aiData }, update: aiData });
      }
    } else if (e.ai) log.notes.push(`perfil del asistente existente (${p.aiProfile?.model}): se conserva`);

    // ── 3. Perfil de diseño (Room Builder) ─────────────────────────────────────
    if (!p.designProfile || (!p.designProfile.designRole && p.designProfile.status !== "approved")) {
      const ai = profileExtract.normalizeExtraction(e.ai ?? {});
      const d = fromProduct.draftDesignProfileFromProduct({
        id: p.id, normalizedName: p.normalizedName, modelNumber: p.modelNumber, manufacturerItem: p.manufacturerItem,
        widthCm: num(row.widthCm), heightCm: num(row.heightCm), depthCm: num(row.depthCm), weight: num(p.weight),
        isDiscontinued: p.isDiscontinued, isCrestronHomeCompatible: p.isCrestronHomeCompatible, vendorProductUrl: p.vendorProductUrl,
        specifications: row.specifications, keyFeatures: row.keyFeatures,
        aiProductType: ai?.productType ?? p.aiProfile?.productType ?? null, aiMountTypes: ai?.mountTypes ?? [], aiApplications: ai?.applications ?? [],
        categoryName: row.category?.name ?? null, familyName: p.family?.name ?? null,
      });
      const dec = (v: number | null) => (v == null ? null : v);
      const dData = {
        designRole: d.designRole, roomCategories: d.roomCategories, mountOptions: d.mountOptions, defaultMountHeightM: dec(d.defaultMountHeightM),
        widthM: dec(d.widthM), heightM: dec(d.heightM), depthM: dec(d.depthM), weightKg: dec(d.weightKg), hfovDeg: dec(d.hfovDeg), vfovDeg: dec(d.vfovDeg),
        maxRangeM: dec(d.maxRangeM), micPattern: d.micPattern, coverageRadiusM: dec(d.coverageRadiusM), diagonalIn: dec(d.diagonalIn),
        viewingDistanceMinM: dec(d.viewingDistanceMinM), viewingDistanceMaxM: dec(d.viewingDistanceMaxM), proxyKey: d.proxyKey,
        completenessScore: d.completenessScore, confidenceScore: d.confidenceScore, status: d.status, fieldEvidence: d.fieldEvidence as never, lastEnrichedAt: now,
      };
      log.changes.designProfile = { before: p.designProfile ? `${p.designProfile.designRole} (${p.designProfile.status})` : null, after: `${d.designRole} · ${d.mountOptions.join(",")} · ${d.status}` };
      if (opt.apply) await prisma.productDesignProfile.upsert({ where: { productId: p.id }, create: { productId: p.id, ...dData }, update: dData });
    }

    // ── 4. Perfil de conexiones (citas validadas contra la ficha) ──────────────
    if (e.io && !opt.noIo) await applyIo(e.io);

    // ── 5. Accesorios que lista el portal ──────────────────────────────────────
    const meta = p.sourceMetadata as { accessories?: Array<{ name?: string; productNumber?: string }> } | null;
    const accSkus = Array.from(new Set([...(meta?.accessories ?? []).map((a) => (a.productNumber || a.name || "").trim()), ...(e.accessorySkus ?? [])].filter(Boolean)));
    if (accSkus.length) {
      const targets = await prisma.product.findMany({ where: { supplierSku: { in: accSkus } }, select: { id: true } });
      const have = new Set(p.accessories.filter((a) => a.kind === "ACCESSORY").map((a) => a.accessoryProductId));
      const add = targets.filter((t) => t.id !== p.id && !have.has(t.id));
      if (add.length) {
        log.changes.accessories = { before: have.size, after: have.size + add.length };
        if (opt.apply) await prisma.accessoryRelation.createMany({ data: add.map((t) => ({ productId: p.id, accessoryProductId: t.id, kind: "ACCESSORY" as const, isRequired: false })), skipDuplicates: true });
      }
    }

    log.result = Object.keys(log.changes).length ? (opt.apply ? "aplicado" : "cambiaría") : "sin cambios";
    count(log.result);
    console.log(`${sku}: ${log.result}${Object.keys(log.changes).length ? ` · ${Object.keys(log.changes).join(", ")}` : ""}${log.notes.length ? ` · ${log.notes.join(" · ")}` : ""}`);

    async function applyIo(io: IoReading) {
      const existing = p!.ioProfile;
      if (existing?.status === "approved") return void log.notes.push("conexiones aprobadas: se conservan");
      const extraction = { applies: io.applies, ports: io.ports ?? [], capabilities: io.capabilities ?? {}, notes: io.notes ?? undefined };
      if (io.applies === false && existing) return; // accesorio: ya tiene perfil
      const base = await ioSource.buildIoSource(row as never, false);
      let text = `${base.text}\n\nTABLA DE ESPECIFICACIONES (portal, original en inglés):\n${englishSpecsText(p!.specifications)}`;
      const urls = [...base.urls];
      for (const u of (io.fetchUrls ?? []).slice(0, 3)) {
        const t = await fetchText(u);
        if (!t || t.length < 200) { log.notes.push(`no se pudo bajar la ficha ${u}`); continue; }
        text += `\n\nFICHA OFICIAL (${new URL(u).hostname}):\n${t.slice(0, MAX_FETCHED_CHARS)}`;
        urls.push(u);
      }
      const v = ioExtract.validateExtraction(extraction, text);
      const status = !v.applies ? "not_applicable" : v.data.ports.length && v.confidence >= 0.9 ? "auto" : "needs_review";
      const oldPorts = Array.isArray(existing?.ports) ? existing!.ports.length : 0;
      if (existing && v.data.ports.length < oldPorts) return void log.notes.push(`conexiones: la lectura nueva pierde puertos (${oldPorts} → ${v.data.ports.length}), se conserva la anterior`);
      if (existing && stable(existing.ports) === stable(v.data.ports) && stable(existing.capabilities) === stable(v.data.capabilities) && existing.status === status) return; // ya está así
      if (existing?.status === "auto" && status !== "auto") return void log.notes.push(`conexiones: la lectura nueva queda ${status}, se conserva la anterior`);
      if (v.rejected.length) log.notes.push(`conexiones: citas descartadas ${v.rejected.map((r) => r.what).join("; ")}`);
      log.changes.ioProfile = { before: existing ? `${existing.status} · ${oldPorts} puertos (${existing.model})` : null, after: `${status} · ${v.data.ports.length} puertos · ${Object.keys(v.data.capabilities).join(",") || "-"}` };
      if (opt.apply) {
        await ioManual.saveManualReading({ productId: p!.id, sourceText: text, sourceUrls: urls, source: io.fetchUrls?.length ? "datasheet" : "specs", extraction, reader: READER });
      }
    }
  }

  fs.writeFileSync(opt.out, JSON.stringify({ mode: opt.apply ? "apply" : "dry-run", at: now.toISOString(), data: opt.data, tally, products: logs }, null, 1));
  console.log({ mode: opt.apply ? "apply" : "dry-run", ...tally, informe: opt.out });
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
