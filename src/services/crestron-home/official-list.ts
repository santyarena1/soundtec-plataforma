/**
 * Lista OFICIAL "Works with Crestron Home" (docs.crestron.com).
 *
 * Fuente: https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Works-with-Crestron-Home.htm
 *
 * Criterio pedido por el Gerente Comercial:
 *  - Solo estas categorías: Audio, Climate Control, Control Systems, Gateways and
 *    Expanders, I/O Devices, Keypads, Lighting, Power Control, Remotes, Sensors,
 *    Shading, Touch Screens, Video. (Fuera: Cameras, Crestron Drivers, Pools,
 *    Security and Door Locks.)
 *  - Dentro de cada categoría, solo los productos CON link (son de Crestron). Los
 *    que no tienen link son de otras marcas (Lutron, Basalte, Autonomic…) y se ignoran.
 *  - Las secciones "Unsupported …" se ignoran aunque tengan link.
 *
 * Este módulo solo parsea HTML (cheerio). La comparación con el catálogo vive en
 * ./match.ts y la regeneración del JSON en scripts/crestron-home-official-fetch.ts.
 */

import * as cheerio from "cheerio";

export const CRESTRON_HOME_DOCS_INDEX_URL =
  "https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/Works-with-Crestron-Home.htm";

const DOCS_BASE = "https://docs.crestron.com/en-us/8525/Content/CP4R/Appendix/Works-With-Crestron-Home/";

export interface CrestronHomeCategory {
  /** Nombre tal como figura en la página índice. */
  name: string;
  /** Página de la categoría (el índice enlaza con estos nombres de archivo). */
  url: string;
}

/** Las 13 categorías consideradas (las marcadas en verde por el pedido). */
export const CRESTRON_HOME_CATEGORIES: readonly CrestronHomeCategory[] = [
  { name: "Audio", url: `${DOCS_BASE}Audio.htm` },
  { name: "Climate Control", url: `${DOCS_BASE}Climate-Control.htm` },
  { name: "Control Systems", url: `${DOCS_BASE}Control-Systems.htm` },
  { name: "Gateways and Expanders", url: `${DOCS_BASE}infiNET-EX-Gateways.htm` },
  { name: "I/O Devices", url: `${DOCS_BASE}IO-Devices.htm` },
  { name: "Keypads", url: `${DOCS_BASE}Keypads.htm` },
  { name: "Lighting", url: `${DOCS_BASE}Lighting.htm` },
  { name: "Power Control", url: `${DOCS_BASE}Power-Control.htm` },
  { name: "Remotes", url: `${DOCS_BASE}Remotes.htm` },
  { name: "Sensors", url: `${DOCS_BASE}Sensors.htm` },
  { name: "Shading", url: `${DOCS_BASE}Shading.htm` },
  { name: "Touch Screens", url: `${DOCS_BASE}Touch-Screens.htm` },
  { name: "Video", url: `${DOCS_BASE}Video.htm` },
];

/** Categorías del índice que el pedido deja afuera (documentadas en el JSON). */
export const CRESTRON_HOME_EXCLUDED_CATEGORIES = ["Cameras", "Crestron Drivers", "Pools", "Security and Door Locks"] as const;

/** Un renglón con link de una página de categoría. */
export interface OfficialCrestronHomeRow {
  /** Modelo tal como lo escribe la documentación (texto del link). */
  model: string;
  description: string;
  /** Sección (h2/h3/h4) donde aparece, ej. "Crestron Audio › Speakers › In-Ceiling". */
  section: string;
  /** Link a crestron.com que trae la documentación. */
  url: string;
  /** Material number cuando el link es crestron.com/model/NNNNNNN. */
  materialNumber: string | null;
  /** Marcado como discontinuado en la documentación (clase "discontinued"). */
  discontinued: boolean;
}

/** Limpia espacios raros y guiones no separables que usa la documentación. */
export function cleanDocText(text: string): string {
  return text
    .replace(/[‐‑‒–—]/g, "-")
    .replace(/[ \s]+/g, " ")
    .trim();
}

/** Material number del link "crestron.com/model/6511856" (null para links /Products/…). */
export function materialNumberFromUrl(url: string): string | null {
  const m = url.match(/crestron\.com\/model\/(\d{6,8})\b/i);
  return m ? m[1] : null;
}

const isCrestronLink = (href: string) => /^https?:\/\/(www\.)?crestron\.com\//i.test(href.trim());

/**
 * Extrae los productos CON link a crestron.com de una página de categoría.
 * Ignora el menú lateral, los renglones sin link (otras marcas) y las secciones
 * "Unsupported …".
 */
export function parseCategoryPage(html: string): OfficialCrestronHomeRow[] {
  const $ = cheerio.load(html);
  const body = $("#mc-main-content").length ? $("#mc-main-content") : $("body");
  const rows: OfficialCrestronHomeRow[] = [];
  const headings: Record<string, string> = {};

  body.find("h2,h3,h4,li").each((_, el) => {
    const tag = el.tagName.toLowerCase();
    if (tag !== "li") {
      headings[tag] = cleanDocText($(el).text());
      // Un h2 nuevo reinicia los niveles inferiores; un h3, el h4.
      if (tag === "h2") delete headings.h3;
      if (tag !== "h4") delete headings.h4;
      return;
    }
    if ($(el).closest("nav, .menu, .sidenav-wrapper").length) return;
    const section = [headings.h2, headings.h3, headings.h4].filter(Boolean).join(" › ");
    if (/unsupported/i.test(section)) return;

    const p = $(el).find("p").first();
    const a = p.children("a[href]").first();
    const href = a.attr("href")?.trim() ?? "";
    if (!a.length || !isCrestronLink(href)) return;
    const model = cleanDocText(a.text());
    if (!model) return;
    const description = cleanDocText(p.text())
      .slice(model.length)
      .replace(/^\s*[-–]\s*/, "")
      .trim();
    rows.push({
      model,
      description,
      section,
      url: href,
      materialNumber: materialNumberFromUrl(href),
      discontinued: ($(el).attr("class") ?? "").split(/\s+/).includes("discontinued"),
    });
  });
  return rows;
}
