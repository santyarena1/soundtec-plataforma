import * as cheerio from "cheerio";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { viewingDistanceFromDiagonalIn } from "./coverage";
import { ensureRoomBuilderSchema } from "./ensure-schema";

const USER_AGENT =
  "Mozilla/5.0 (compatible; SoundtecRoomBuilder/1.0; +https://www.soundtecportal.com.ar)";

export type OfficialExtract = {
  hfovDeg: number | null;
  vfovDeg: number | null;
  maxRangeM: number | null;
  coverageRadiusM: number | null;
  diagonalIn: number | null;
  viewingDistanceMinM: number | null;
  viewingDistanceMaxM: number | null;
  evidence: Record<string, { source: string; note: string }>;
};

function parseNumber(raw: string | undefined | null): number | null {
  if (!raw) return null;
  const m = raw.replace(",", ".").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) ? n : null;
}

function parseDegrees(raw: string | undefined | null): number | null {
  const n = parseNumber(raw);
  if (n == null || n < 5 || n > 180) return null;
  return n;
}

function metersFromLength(raw: string): number | null {
  const lower = raw.toLowerCase();
  const n = parseNumber(raw);
  if (n == null) return null;
  if (/\b(mm)\b/.test(lower)) return n / 1000;
  if (/\b(cm)\b/.test(lower)) return n / 100;
  if (/\b(ft|feet|')\b/.test(lower)) return n * 0.3048;
  if (/\b(in|inch|")\b/.test(lower) && n > 20) return null; // likely diagonal inches
  if (/\b(m|meter|metre|metros?)\b/.test(lower)) return n;
  // bare number near "range/distance" → assume meters if 0.5..30
  if (n >= 0.5 && n <= 30) return n;
  return null;
}

/** Extrae FOV/alcance/diagonal SOLO del HTML oficial (sin Serper). */
export function extractCoverageFromOfficialHtml(
  html: string,
  pageUrl: string,
): OfficialExtract {
  const $ = cheerio.load(html);
  $("script, style, noscript").remove();
  const text = $("body").text().replace(/\s+/g, " ").trim();

  const evidence: OfficialExtract["evidence"] = {};
  let hfovDeg: number | null = null;
  let vfovDeg: number | null = null;
  let maxRangeM: number | null = null;
  let coverageRadiusM: number | null = null;
  let diagonalIn: number | null = null;

  const fovMatch =
    text.match(
      /(?:field\s*of\s*view|horizontal\s*fov|\bfov\b)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*°?/i,
    ) ||
    text.match(/(\d{2,3}(?:\.\d+)?)\s*°\s*(?:horizontal|h\.?\s*fov|fov)/i);
  if (fovMatch) {
    hfovDeg = parseDegrees(fovMatch[1]);
    if (hfovDeg != null) {
      evidence.hfovDeg = { source: pageUrl, note: fovMatch[0].slice(0, 120) };
    }
  }

  const vfovMatch = text.match(
    /(?:vertical\s*fov|v\.?\s*fov)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*°?/i,
  );
  if (vfovMatch) {
    vfovDeg = parseDegrees(vfovMatch[1]);
    if (vfovDeg != null) {
      evidence.vfovDeg = { source: pageUrl, note: vfovMatch[0].slice(0, 120) };
    }
  }

  const rangeMatch =
    text.match(
      /(?:max(?:imum)?\s*(?:camera\s*)?(?:range|distance)|alcance\s*m[aá]x(?:imo)?)\s*[:\-]?\s*([\d.,]+\s*(?:m|meters?|ft|feet)?)/i,
    ) ||
    text.match(
      /(?:operating\s*range|pickup\s*range)\s*[:\-]?\s*([\d.,]+\s*(?:m|meters?|ft|feet)?)/i,
    );
  if (rangeMatch) {
    maxRangeM = metersFromLength(rangeMatch[1]);
    if (maxRangeM != null) {
      evidence.maxRangeM = { source: pageUrl, note: rangeMatch[0].slice(0, 120) };
    }
  }

  const micMatch = text.match(
    /(?:coverage\s*radius|pickup\s*radius|radio\s*de\s*cobertura)\s*[:\-]?\s*([\d.,]+\s*(?:m|meters?|ft|feet|cm)?)/i,
  );
  if (micMatch) {
    coverageRadiusM = metersFromLength(micMatch[1]);
    if (coverageRadiusM != null) {
      evidence.coverageRadiusM = {
        source: pageUrl,
        note: micMatch[0].slice(0, 120),
      };
    }
  }

  const diagMatch =
    text.match(
      /(?:screen\s*size|diagonal|display\s*size)\s*[:\-]?\s*(\d{2,3}(?:\.\d+)?)\s*(?:("|in|inch|pulgadas))?/i,
    ) || text.match(/\b(\d{2,3})\s*(?:("|in|inch)\b)/i);
  if (diagMatch) {
    const d = parseNumber(diagMatch[1]);
    if (d != null && d >= 24 && d <= 120) {
      diagonalIn = d;
      evidence.diagonalIn = { source: pageUrl, note: diagMatch[0].slice(0, 120) };
    }
  }

  // Spec tables: label/value pairs
  $("tr").each((_, tr) => {
    const cells = $(tr)
      .find("th, td")
      .toArray()
      .map((c) => $(c).text().replace(/\s+/g, " ").trim());
    if (cells.length < 2) return;
    const label = cells[0] ?? "";
    const value = cells[1] ?? "";
    if (!hfovDeg && /fov|field of view|ángulo|angulo/i.test(label)) {
      hfovDeg = parseDegrees(value);
      if (hfovDeg != null) {
        evidence.hfovDeg = { source: pageUrl, note: `${label}=${value}` };
      }
    }
    if (!maxRangeM && /range|alcance|distance/i.test(label)) {
      maxRangeM = metersFromLength(value);
      if (maxRangeM != null) {
        evidence.maxRangeM = { source: pageUrl, note: `${label}=${value}` };
      }
    }
    if (!coverageRadiusM && /coverage|pickup|radio/i.test(label)) {
      coverageRadiusM = metersFromLength(value);
      if (coverageRadiusM != null) {
        evidence.coverageRadiusM = {
          source: pageUrl,
          note: `${label}=${value}`,
        };
      }
    }
    if (!diagonalIn && /diagonal|screen size|tamaño/i.test(label)) {
      const d = parseNumber(value);
      if (d != null && d >= 24 && d <= 120) {
        diagonalIn = d;
        evidence.diagonalIn = { source: pageUrl, note: `${label}=${value}` };
      }
    }
  });

  let viewingDistanceMinM: number | null = null;
  let viewingDistanceMaxM: number | null = null;
  if (diagonalIn != null) {
    const v = viewingDistanceFromDiagonalIn(diagonalIn);
    viewingDistanceMinM = v.viewMinM;
    viewingDistanceMaxM = v.viewMaxM;
  }

  return {
    hfovDeg,
    vfovDeg,
    maxRangeM,
    coverageRadiusM,
    diagonalIn,
    viewingDistanceMinM,
    viewingDistanceMaxM,
    evidence,
  };
}

async function fetchOfficialHtml(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    const res = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,es;q=0.8",
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const ctype = res.headers.get("content-type") ?? "";
    if (!/html|xml|text/i.test(ctype) && ctype) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export type OfficialEnrichBatchResult = {
  scanned: number;
  updated: number;
  skipped: number;
  failed: number;
  nextCursor: string | null;
};

/**
 * Enriquece perfiles incompletos de cobertura desde vendorProductUrl oficial.
 * No usa Serper. Solo escribe campos de cobertura si el HTML aporta dato.
 */
export async function enrichOfficialCoverageBatch(options?: {
  take?: number;
  cursor?: string | null;
  roles?: string[];
}): Promise<OfficialEnrichBatchResult> {
  await ensureRoomBuilderSchema();
  const take = Math.min(Math.max(options?.take ?? 20, 1), 40);
  const roles = options?.roles ?? ["camera", "mic", "display"];

  const profiles = await prisma.productDesignProfile.findMany({
    where: {
      designRole: { in: roles },
      product: {
        isActive: true,
        vendorProductUrl: { not: null },
      },
      OR: [
        { hfovDeg: null, designRole: "camera" },
        { coverageRadiusM: null, designRole: "mic" },
        { diagonalIn: null, designRole: "display" },
        { maxRangeM: null, designRole: "camera" },
      ],
      ...(options?.cursor ? { id: { gt: options.cursor } } : {}),
    },
    orderBy: { id: "asc" },
    take,
    include: {
      product: { select: { id: true, vendorProductUrl: true } },
    },
  });

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const profile of profiles) {
    const url = profile.product.vendorProductUrl;
    if (!url) {
      skipped += 1;
      continue;
    }
    const html = await fetchOfficialHtml(url);
    if (!html) {
      failed += 1;
      continue;
    }
    const extracted = extractCoverageFromOfficialHtml(html, url);
    const hasAny =
      extracted.hfovDeg != null ||
      extracted.maxRangeM != null ||
      extracted.coverageRadiusM != null ||
      extracted.diagonalIn != null;
    if (!hasAny) {
      skipped += 1;
      continue;
    }

    const prevEvidence =
      profile.fieldEvidence && typeof profile.fieldEvidence === "object"
        ? (profile.fieldEvidence as Record<string, { source: string; note: string }>)
        : {};

    const data: Prisma.ProductDesignProfileUpdateInput = {
      lastEnrichedAt: new Date(),
      fieldEvidence: {
        ...prevEvidence,
        ...extracted.evidence,
      } as Prisma.InputJsonValue,
      status: "auto",
    };

    if (extracted.hfovDeg != null && profile.hfovDeg == null) {
      data.hfovDeg = new Prisma.Decimal(extracted.hfovDeg);
    }
    if (extracted.vfovDeg != null && profile.vfovDeg == null) {
      data.vfovDeg = new Prisma.Decimal(extracted.vfovDeg);
    }
    if (extracted.maxRangeM != null && profile.maxRangeM == null) {
      data.maxRangeM = new Prisma.Decimal(extracted.maxRangeM);
    }
    if (extracted.coverageRadiusM != null && profile.coverageRadiusM == null) {
      data.coverageRadiusM = new Prisma.Decimal(extracted.coverageRadiusM);
    }
    if (extracted.diagonalIn != null && profile.diagonalIn == null) {
      data.diagonalIn = new Prisma.Decimal(extracted.diagonalIn);
    }
    if (
      extracted.viewingDistanceMinM != null &&
      profile.viewingDistanceMinM == null
    ) {
      data.viewingDistanceMinM = new Prisma.Decimal(extracted.viewingDistanceMinM);
    }
    if (
      extracted.viewingDistanceMaxM != null &&
      profile.viewingDistanceMaxM == null
    ) {
      data.viewingDistanceMaxM = new Prisma.Decimal(extracted.viewingDistanceMaxM);
    }

    // bump completeness lightly when coverage arrives
    const completenessBoost =
      (extracted.hfovDeg != null ||
      extracted.coverageRadiusM != null ||
      extracted.diagonalIn != null
        ? 0.12
        : 0) + (extracted.maxRangeM != null ? 0.05 : 0);
    data.completenessScore = Math.min(
      1,
      profile.completenessScore + completenessBoost,
    );
    data.confidenceScore = Math.min(
      1,
      profile.confidenceScore + completenessBoost,
    );

    await prisma.productDesignProfile.update({
      where: { id: profile.id },
      data,
    });
    updated += 1;
  }

  return {
    scanned: profiles.length,
    updated,
    skipped,
    failed,
    nextCursor:
      profiles.length === take ? profiles[profiles.length - 1]!.id : null,
  };
}
