import { searchWeb } from "@/services/serper";

/**
 * Ficha pública de crestron.com (catálogo). Xtrabone no trae texto ni fotos;
 * acá buscamos la página oficial por modelo y extraemos overview, specs e imagen.
 */

export type CrestronCatalogSpec = {
  group: string;
  label: string;
  value: string;
};

export type CrestronCatalogPage = {
  url: string;
  sku: string;
  name: string;
  tagline: string | null;
  shortDescription: string | null;
  overview: string | null;
  keyFeatures: string[];
  specs: CrestronCatalogSpec[];
  imageUrls: string[];
  materialNumber: string | null;
};

const CATALOG_HOST = /https?:\/\/(www\.)?crestron\.com\/Products\/Catalog\//i;

function decodeEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&trade;/gi, "™")
    .replace(/&reg;/gi, "®")
    .replace(/&copy;/gi, "©")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

function stripTags(html: string) {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|h[1-6]|li|tr|dt|dd)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function metaContent(html: string, name: string) {
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`,
    "i"
  );
  const tag = html.match(re)?.[0];
  const content = tag?.match(/content=["']([^"']*)["']/i)?.[1];
  return content ? decodeEntities(content) : null;
}

function preferLargeImage(url: string) {
  return url.replace(/\/(\d+x\d+px)\//, "/600x400px/");
}

function uniqueUrls(urls: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of urls) {
    const cleaned = raw.split("?")[0] || raw;
    const url = `${preferLargeImage(cleaned)}?c=0`;
    const key = cleaned.match(/\/img\/crestron\/([^/]+)/i)?.[1] ?? cleaned;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(url);
  }
  return out;
}

function parseJsonLd(html: string): { name?: string; description?: string; images?: string[] } | null {
  const block = html.match(
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i
  )?.[1];
  if (!block) return null;
  try {
    const parsed = JSON.parse(block) as {
      name?: string;
      description?: string;
      image?: string | string[];
    };
    const images = Array.isArray(parsed.image)
      ? parsed.image.filter((u) => typeof u === "string")
      : typeof parsed.image === "string"
        ? [parsed.image]
        : [];
    return {
      name: parsed.name?.trim() || undefined,
      description: parsed.description?.trim() || undefined,
      images,
    };
  } catch {
    return null;
  }
}

function extractSpecs(html: string): CrestronCatalogSpec[] {
  const tables = html.match(/<table[\s\S]*?<\/table>/gi) ?? [];
  const specs: CrestronCatalogSpec[] = [];
  for (const table of tables) {
    const text = stripTags(table);
    if (text.length < 8 || /navigation|cookie|privacy/i.test(text)) continue;
    let group = "Especificaciones";
    const rows = table.match(/<tr[\s\S]*?<\/tr>/gi) ?? [];
    for (const row of rows) {
      const cells = [...row.matchAll(/<(?:th|td)[^>]*>([\s\S]*?)<\/(?:th|td)>/gi)].map((m) =>
        stripTags(m[1])
      );
      if (cells.length === 1 && cells[0]) {
        group = cells[0].slice(0, 80);
        continue;
      }
      if (cells.length >= 2 && cells[0] && cells[1]) {
        specs.push({ group, label: cells[0].slice(0, 120), value: cells.slice(1).join(" · ").slice(0, 500) });
      }
    }
  }
  return specs.slice(0, 80);
}

function extractOverview(html: string): string | null {
  const panel = html.match(
    /id=["']panel1["'][^>]*>([\s\S]*?)(?:<div[^>]+id=["']panel\d|$)/i
  )?.[1];
  if (panel) {
    const text = stripTags(panel);
    if (text.length > 80) return text.slice(0, 8000);
  }
  const fromOverview = html.match(
    /Overview Specifications Resources Models([\s\S]{80,16000}?)(?:#####\s*Key Features|<h[1-6][^>]*>\s*Key Features|This product may be purchased)/i
  )?.[1];
  if (fromOverview) {
    const text = stripTags(fromOverview);
    if (text.length > 80) return text.slice(0, 8000);
  }
  return null;
}

function extractKeyFeatures(html: string): string[] {
  const block = html.match(
    /Key Features([\s\S]{40,8000}?)(?:\d+\.\s+A BACnet|This product may be purchased|<h[1-6])/i
  )?.[1];
  if (!block) return [];
  const lis = [...block.matchAll(/<li[^>]*>([\s\S]*?)<\/li>/gi)].map((m) => stripTags(m[1]));
  if (lis.length > 0) return lis.filter((t) => t.length > 4).slice(0, 24);
  return stripTags(block)
    .split(/\n|•/)
    .map((t) => t.replace(/^[-–]\s*/, "").trim())
    .filter((t) => t.length > 8)
    .slice(0, 24);
}

export async function findCrestronCatalogUrl(sku: string): Promise<string | null> {
  const model = sku.trim();
  if (!model) return null;
  const hits = await searchWeb(`"${model}" site:crestron.com/Products/Catalog`, 8);
  const catalog = hits.filter((h) => CATALOG_HOST.test(h.url) && !/example\.com/i.test(h.url));
  const exact = catalog.find((h) => h.url.toUpperCase().includes(model.toUpperCase()));
  return (exact ?? catalog[0])?.url ?? null;
}

export async function fetchCrestronCatalogPage(url: string, sku: string): Promise<CrestronCatalogPage | null> {
  const resp = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (compatible; SoundtecCatalog/1.0; +https://soundtec.com.ar)",
      Accept: "text/html,application/xhtml+xml",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(20000),
  });
  if (!resp.ok) return null;
  const html = await resp.text();
  if (/404\s+This site is protected by reCAPTCHA/i.test(html) && !metaContent(html, "og:title")) {
    return null;
  }

  const jsonLd = parseJsonLd(html);
  const ogTitle = metaContent(html, "og:title") ?? "";
  const name =
    jsonLd?.name ||
    ogTitle.replace(/\s*\[Crestron Electronics, Inc\.\]\s*$/i, "").trim() ||
    sku;
  const shortDescription = metaContent(html, "description") || metaContent(html, "og:description");
  const tagline = jsonLd?.description ?? null;
  const material =
    html.match(/Material Number:\s*([0-9]+)/i)?.[1] ??
    html.match(/Material Number<\/[^>]+>\s*([^<]+)/i)?.[1]?.trim() ??
    null;

  const ogImage = metaContent(html, "og:image");
  const widen = [...html.matchAll(/https:\/\/embed\.widencdn\.net\/img\/crestron\/[^"' \s]+/gi)].map(
    (m) => m[0]
  );
  const imageUrls = uniqueUrls(
    [...(jsonLd?.images ?? []), ...(ogImage ? [ogImage] : []), ...widen].filter((u) =>
      /^https:\/\//i.test(u)
    )
  ).slice(0, 6);

  return {
    url,
    sku,
    name,
    tagline,
    shortDescription,
    overview: extractOverview(html),
    keyFeatures: extractKeyFeatures(html),
    specs: extractSpecs(html),
    imageUrls,
    materialNumber: material,
  };
}

export async function lookupCrestronCatalog(sku: string): Promise<CrestronCatalogPage | null> {
  const url = await findCrestronCatalogUrl(sku);
  if (!url) return null;
  return fetchCrestronCatalogPage(url, sku);
}
