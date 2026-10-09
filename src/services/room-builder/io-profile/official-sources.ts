/**
 * Enriquecimiento: cuando el catálogo no trae ficha técnica de un producto, se
 * busca la oficial en la web. Solo valen los sitios del fabricante (nunca
 * tiendas ni revendedores), así el dato es tan confiable como la ficha.
 */

import { searchWeb } from "@/services/serper";

/** Dominios oficiales por marca (nombre normalizado → dominios). */
const OFFICIAL_DOMAINS: Record<string, string[]> = {
  crestron: ["crestron.com"],
  shure: ["shure.com"],
  biamp: ["biamp.com"],
  qsc: ["qsc.com"],
  "q sys": ["qsys.com", "qsc.com"],
  sonance: ["sonance.com"],
  soundtube: ["soundtube.com"],
  kramer: ["kramerav.com"],
  extron: ["extron.com"],
  samsung: ["samsung.com", "displaysolutions.samsung.com"],
  lg: ["lg.com", "lg-informationdisplay.com"],
  logitech: ["logitech.com"],
  yealink: ["yealink.com"],
  poly: ["poly.com", "hp.com"],
  sennheiser: ["sennheiser.com"],
  bose: ["boseprofessional.com", "bose.com"],
  "bose professional": ["boseprofessional.com"],
  jbl: ["jblpro.com", "jbl.com"],
  harman: ["pro.harman.com", "harman.com"],
  "audio technica": ["audio-technica.com"],
  sony: ["sony.com", "pro.sony"],
  epson: ["epson.com"],
  benq: ["benq.com"],
  "hall research": ["hallresearch.com"],
  "hall technologies": ["halltechav.com"],
  "blaze audio": ["blaze-audio.com"],
  blaze: ["blaze-audio.com"],
  sonos: ["sonos.com"],
  bluesound: ["bluesound.com"],
  "bluesound professional": ["bluesound.com", "bluesoundprofessional.com"],
  atlona: ["atlona.com"],
  "atlas sound": ["atlasied.com"],
  atlasied: ["atlasied.com"],
  ecler: ["ecler.com"],
  "audac": ["audac.eu"],
  apart: ["apart-audio.com"],
  "yamaha": ["yamaha.com", "uc.yamaha.com"],
  "nureva": ["nureva.com"],
  "jabra": ["jabra.com"],
  "huddly": ["huddly.com"],
  "aver": ["averusa.com", "aver.com"],
  "ptzoptics": ["ptzoptics.com"],
  "netgear": ["netgear.com"],
  "luxul": ["luxul.com"],
  "control4": ["control4.com", "snapone.com"],
  "lutron": ["lutron.com"],
  "chief": ["chief.legrandav.com", "legrandav.com"],
  "da lite": ["legrandav.com"],
  "middle atlantic": ["legrandav.com"],
  "wattbox": ["snapone.com"],
  "triad": ["triadspeakers.com"],
  "origin acoustics": ["originacoustics.com"],
  "kef": ["kef.com"],
  "bowers wilkins": ["bowerswilkins.com"],
  "marantz": ["marantz.com"],
  "denon": ["denon.com"],
  "lenovo": ["lenovo.com"],
  "microsoft": ["microsoft.com"],
  "neat": ["neat.no"],
  "cisco": ["cisco.com"],
  "zoom": ["zoom.us"],
  "vaddio": ["legrandav.com"],
};

/** Tiendas y agregadores: tienen fichas, pero no son la fuente. */
const NOT_OFFICIAL = /amazon\.|ebay\.|mercadolibre|bhphotovideo|fullcompass|adorama|sweetwater|crutchfield|avsforum|manualslib|manua\.ls|manualzz|scribd|pdf4pro|datasheets?\.com|alibaba|aliexpress|walmart|newegg|cdw\.com|provantage|projectorcentral|reddit|youtube|facebook|linkedin/i;

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** ¿La URL es del fabricante de esa marca? */
export function isOfficialUrl(url: string, brand: string | null): boolean {
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (NOT_OFFICIAL.test(host)) return false;
  if (!brand) return false;
  const b = norm(brand);
  const domains = OFFICIAL_DOMAINS[b] ?? OFFICIAL_DOMAINS[b.split(" ")[0] ?? ""] ?? [];
  if (domains.some((d) => host === d || host.endsWith(`.${d}`))) return true;
  // Marcas sin mapa: el dominio tiene que contener el nombre de la marca.
  const token = b.replace(/\s+/g, "");
  return token.length >= 3 && host.replace(/[^a-z0-9]/g, "").includes(token);
}

export type FoundDoc = { url: string; title: string; isPdf: boolean; /** Fuente secundaria (distribuidor, manual subido, foro técnico). */ secondary?: boolean };

/** Ni siquiera como fuente secundaria (sin datos técnicos confiables). */
const NO_SOURCE = /youtube|facebook|instagram|tiktok|pinterest|twitter|x\.com|linkedin|wikipedia/i;

/**
 * Sin ficha oficial publicada: distribuidores, manuales subidos y foros técnicos.
 * El dato igual tiene que salir citado textual de esa página.
 */
export async function findSecondarySources(brand: string | null, model: string, max = 3): Promise<FoundDoc[]> {
  if (!model.trim()) return [];
  const name = [brand, model].filter(Boolean).join(" ");
  const queries = [`"${model}" ${brand ?? ""} specifications inputs outputs`, `"${model}" ${brand ?? ""} manual pdf rear panel connections`];
  const key = norm(model).replace(/\s+/g, "");
  const out: FoundDoc[] = [];
  for (const q of queries) {
    const results = await searchWeb(q, 10);
    for (const r of results) {
      if (out.length >= max) break;
      let host = "";
      try {
        host = new URL(r.url).hostname;
      } catch {
        continue;
      }
      if (NO_SOURCE.test(host) || out.some((o) => o.url === r.url)) continue;
      const hay = norm(`${r.title} ${r.snippet ?? ""} ${r.url}`).replace(/\s+/g, "");
      if (key.length >= 3 && !hay.includes(key)) continue;
      out.push({ url: r.url, title: r.title || name, isPdf: /\.pdf(\?|$)/i.test(r.url), secondary: true });
    }
    if (out.length >= max) break;
  }
  return out;
}

/** Busca la ficha oficial (PDF primero, página de especificaciones después). */
export async function findOfficialDatasheets(brand: string | null, model: string, max = 2): Promise<FoundDoc[]> {
  if (!brand || !model.trim()) return [];
  const domains = OFFICIAL_DOMAINS[norm(brand)] ?? [];
  const site = domains.length ? ` (${domains.map((d) => `site:${d}`).join(" OR ")})` : "";
  const queries = [`${brand} ${model} datasheet specifications filetype:pdf${site}`, `${brand} ${model} specifications${site}`];
  const out: FoundDoc[] = [];
  for (const q of queries) {
    const results = await searchWeb(q, 8);
    for (const r of results) {
      if (out.length >= max) break;
      if (!isOfficialUrl(r.url, brand) || out.some((o) => o.url === r.url)) continue;
      // El resultado tiene que nombrar el modelo (evita fichas de otro equipo de la marca).
      const hay = norm(`${r.title} ${r.snippet ?? ""} ${r.url}`);
      const key = norm(model).replace(/\s+/g, "");
      if (key.length >= 3 && !hay.replace(/\s+/g, "").includes(key)) continue;
      out.push({ url: r.url, title: r.title, isPdf: /\.pdf(\?|$)/i.test(r.url) });
    }
    if (out.some((o) => o.isPdf) || out.length >= max) break;
  }
  return out.sort((a, b) => Number(b.isPdf) - Number(a.isPdf));
}
