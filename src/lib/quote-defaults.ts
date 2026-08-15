import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";

export const QUOTE_STEPS = [
  { id: 1, key: "datos", title: "Datos" },
  { id: 2, key: "brief", title: "Brief y planos" },
  { id: 3, key: "plantilla", title: "Plantilla" },
  { id: 4, key: "equipos", title: "Planilla" },
  { id: 5, key: "textos", title: "Textos" },
  { id: 6, key: "imagenes", title: "Imágenes" },
  { id: 7, key: "emitir", title: "Emitir" },
] as const;

export type QuoteStepKey = (typeof QUOTE_STEPS)[number]["key"];

export function parseQuoteStep(raw: string | undefined): number {
  if (raw == null || raw === "") return 2;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1 || n > QUOTE_STEPS.length) return 2;
  return n;
}

export type QuoteModuleKind = "fixed" | "ai" | "table";

export type QuoteModuleDef = {
  key: string;
  title: string;
  kind: QuoteModuleKind;
  description: string;
  body: string;
  defaultOn: ("resumido" | "tecnico" | "premium")[];
};

export const LETTER_OPEN_TEMPLATE = `De nuestra consideración:
De acuerdo a lo solicitado se extiende para su evaluación la presente cotización por la provisión de equipamiento y/o servicios para el sistema de la referencia.`;

export const AI_SECTION_STUB =
  "Se completa en Brief y planos (o a mano en Textos). La IA no inventa precios.";

export const QUOTE_CORPORATE_ASSETS = {
  logo: "/quotes/soundtec-logo.png",
  header: "/quotes/soundtec-header.png",
  brands: "/quotes/soundtec-brands.png",
  iso: "/quotes/iso-iram-iqnet.jpeg",
} as const;

export const CORPORATE_BODIES: Record<string, string> = {};

export const QUOTE_MODULES: QuoteModuleDef[] = [
  {
    key: "letter_open",
    title: "Apertura de carta",
    kind: "fixed",
    description: "Párrafo de consideración. Fijo de plantilla.",
    body: LETTER_OPEN_TEMPLATE,
    defaultOn: ["resumido", "tecnico", "premium"],
  },
  {
    key: "corporate_intro",
    title: "Presentación Soundtec",
    kind: "fixed",
    description: "Quiénes somos. Logo y texto institucional.",
    body: `SOUNDTEC es partner autorizado y distribuidor para la República Argentina de los fabricantes de los productos objeto de este presupuesto. El personal técnico y comercial está certificado y/o calificado por los fabricantes para las especialidades que cada marca requiere.

SOUNDTEC, con más de 35 años de trayectoria, ofrece servicios audiovisuales con el respaldo de las marcas que representa y con certificación ISO 9001.`,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "disciplines",
    title: "Disciplinas",
    kind: "fixed",
    description: "Franja Audio · Video · Iluminación · UC · Control.",
    body: "Audio profesional · Video · Iluminación · Unified Communications · Control e integración.",
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "brands",
    title: "Marcas",
    kind: "fixed",
    description: "Collage institucional de marcas (fijo de plantilla Word).",
    body: "Las marcas incluidas en esta propuesta son aquellas efectivamente cotizadas. SOUNDTEC representa más de 70 marcas de audio, video, iluminación, UC y control.",
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "proposal",
    title: "Nuestra propuesta",
    kind: "ai",
    description: "La IA redacta según el brief. Se puede rehacer o escribir a mano.",
    body: AI_SECTION_STUB,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "design_criteria",
    title: "Criterios de diseño",
    kind: "ai",
    description: "Campo de proyecto. Lo llena la IA a partir del brief y los planos.",
    body: AI_SECTION_STUB,
    defaultOn: ["premium"],
  },
  {
    key: "key_products",
    title: "Productos clave",
    kind: "ai",
    description: "Fichas narrativas de los equipos importantes. IA + catálogo.",
    body: AI_SECTION_STUB,
    defaultOn: ["premium"],
  },
  {
    key: "functionality",
    title: "Funcionalidad",
    kind: "ai",
    description: "Cómo se usa el sistema en este proyecto.",
    body: AI_SECTION_STUB,
    defaultOn: ["premium"],
  },
  {
    key: "products_table",
    title: "Productos y servicios",
    kind: "table",
    description: "La planilla. Siempre forma parte del documento.",
    body: "",
    defaultOn: ["resumido", "tecnico", "premium"],
  },
  {
    key: "installation",
    title: "Instalación del sistema",
    kind: "fixed",
    description: "Texto de obra estándar Soundtec.",
    body: `La instalación contempla el montaje del equipamiento y la distribución de señal según cada zona. El tendido se ejecuta con cableado profesional, canalizaciones discretas y fijaciones adecuadas.

Se prioriza calidad técnica, discreción visual, durabilidad, confiabilidad y seguridad. El sistema se verifica, ajusta y deja en funcionamiento.

Cualquier intervención fuera de estos supuestos es responsabilidad del cliente.`,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "staff",
    title: "Personal técnico",
    kind: "fixed",
    description: "Staff, ART, uniforme, certificaciones.",
    body: `El staff técnico se forma de manera permanente y cuenta con certificaciones de fabricantes. SOUNDTEC está certificada bajo ISO 9001. El personal se presenta uniformado, con ART y seguro de vida obligatorio.`,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "commercial_terms",
    title: "Condiciones comerciales",
    kind: "fixed",
    description: "Precio, BNA, forma de pago, vigencia. Campos de empresa.",
    body: `PRECIO
Los precios están expresados en dólares estadounidenses (Dólar Oficial) y no incluyen IVA.

REFERENCIA DE PAGO
El pago podrá efectuarse en pesos argentinos, según cotización billete tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura.

FORMA DE PAGO
A convenir.

MANTENIMIENTO DE LA OFERTA
La oferta se mantiene vigente por el plazo indicado en las condiciones de esta cotización.

PLAZO DE ENTREGA
Se confirma con la orden de compra. La columna de entrega es tentativa y sujeta a stock.`,
    defaultOn: ["resumido", "tecnico", "premium"],
  },
  {
    key: "warranty",
    title: "Garantía",
    kind: "fixed",
    description: "12 meses salvo indicación en la planilla.",
    body: `Salvo indicación en contrario en la planilla, los productos gozan de garantía de 12 meses a partir de la facturación, contra vicios de fabricación, de acuerdo con las condiciones del fabricante.`,
    defaultOn: ["resumido", "tecnico", "premium"],
  },
  {
    key: "iso",
    title: "Calidad certificada ISO 9001",
    kind: "fixed",
    description: "Sellos IRAM / IQNet y texto de certificación.",
    body: `SOUNDTEC S.R.L. es la primera empresa argentina del sector sonido, iluminación, video y videoconferencia profesional en certificar su sistema de gestión de la calidad conforme a ISO 9001, con alcance en ventas y alquileres, servicio técnico, eventos, diseño, realización y mantenimiento de instalaciones.`,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "closing",
    title: "Cierre y firma",
    kind: "fixed",
    description: "Cierre de carta. La firma sale del perfil del usuario.",
    body: `Sin otro particular, y a la espera de su amable respuesta, lo/a saluda cordialmente.`,
    defaultOn: ["resumido", "tecnico", "premium"],
  },
];

for (const m of QUOTE_MODULES) {
  if (m.body) CORPORATE_BODIES[m.key] = m.body;
}

export const AI_MODULE_KEYS = QUOTE_MODULES.filter((m) => m.kind === "ai").map((m) => m.key);
export const FIXED_MODULE_KEYS = QUOTE_MODULES.filter((m) => m.kind === "fixed").map((m) => m.key);

export function moduleByKey(key: string) {
  return QUOTE_MODULES.find((m) => m.key === key);
}

export const PROFILES = [
  {
    key: "resumido",
    name: "Resumido",
    description: "Carta corta: intro, tabla, condiciones, garantía.",
    sectionKeys: QUOTE_MODULES.filter((m) => m.defaultOn.includes("resumido")).map((m) => m.key),
    isDefault: false,
  },
  {
    key: "tecnico",
    name: "Técnico estándar",
    description: "Propuesta + tabla + instalación + condiciones.",
    sectionKeys: QUOTE_MODULES.filter((m) => m.defaultOn.includes("tecnico")).map((m) => m.key),
    isDefault: true,
  },
  {
    key: "premium",
    name: "Técnico premium",
    description: "Editorial: fichas, fotos, criterios, como COT detallada.",
    sectionKeys: QUOTE_MODULES.filter((m) => m.defaultOn.includes("premium")).map((m) => m.key),
    isDefault: false,
  },
] as const;

export async function getCompanyIdentity() {
  const [name, tagline, address, phone, email, web, logoUrl, headerUrl, brandsUrl, isoUrl, primary] = await Promise.all([
    getSetting("app.name", "SOUNDTEC"),
    getSetting(QUOTE_SETTING_KEYS.companyTagline, "integramos tecnología"),
    getSetting(QUOTE_SETTING_KEYS.companyAddress, "Av. Donato Alvarez 1526 (C1416BTR) C.A.B.A."),
    getSetting(QUOTE_SETTING_KEYS.companyPhone, "(+ 54 11) 4586 0400"),
    getSetting(QUOTE_SETTING_KEYS.companyEmail, "info@soundtec.com.ar"),
    getSetting(QUOTE_SETTING_KEYS.companyWeb, "www.soundtec.com.ar"),
    getSetting(QUOTE_SETTING_KEYS.companyLogoUrl, QUOTE_CORPORATE_ASSETS.logo),
    getSetting(QUOTE_SETTING_KEYS.companyHeaderUrl, QUOTE_CORPORATE_ASSETS.header),
    getSetting(QUOTE_SETTING_KEYS.companyBrandsUrl, QUOTE_CORPORATE_ASSETS.brands),
    getSetting(QUOTE_SETTING_KEYS.companyIsoUrl, QUOTE_CORPORATE_ASSETS.iso),
    getSetting("branding.primary_color", "#1e3553"),
  ]);
  return {
    name,
    tagline,
    address,
    phone,
    email,
    web,
    logoUrl: logoUrl || QUOTE_CORPORATE_ASSETS.logo,
    headerUrl: headerUrl || QUOTE_CORPORATE_ASSETS.header,
    brandsUrl: brandsUrl || QUOTE_CORPORATE_ASSETS.brands,
    isoUrl: isoUrl || QUOTE_CORPORATE_ASSETS.iso,
    primary,
  };
}

export async function ensureQuoteProfiles() {
  for (const p of PROFILES) {
    await prisma.quoteContentProfile.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        description: p.description,
        sectionKeys: [...p.sectionKeys],
        isDefault: p.isDefault,
      },
      create: {
        key: p.key,
        name: p.name,
        description: p.description,
        sectionKeys: [...p.sectionKeys],
        isDefault: p.isDefault,
      },
    });
  }
  for (const m of QUOTE_MODULES) {
    await prisma.quoteBlock.upsert({
      where: { key_version: { key: m.key, version: 1 } },
      update: { title: m.title, category: m.kind, isActive: true },
      create: { key: m.key, version: 1, title: m.title, category: m.kind, body: m.body, isActive: true },
    });
  }
}

export async function resolveQuoteModuleBodies(): Promise<Record<string, string>> {
  await ensureQuoteProfiles();
  const blocks = await prisma.quoteBlock.findMany({ where: { version: 1, isActive: true } });
  const byKey = new Map(blocks.map((b) => [b.key, b.body]));
  const out: Record<string, string> = {};
  for (const m of QUOTE_MODULES) {
    const stored = (byKey.get(m.key) || "").trim();
    if (stored) out[m.key] = stored;
    else if (m.kind === "ai") out[m.key] = AI_SECTION_STUB;
    else out[m.key] = m.body;
  }
  return out;
}

export async function resolveDefaultProfileId() {
  await ensureQuoteProfiles();
  const fromSetting = await getSetting(QUOTE_SETTING_KEYS.defaultProfile, "tecnico");
  const found = await prisma.quoteContentProfile.findUnique({ where: { key: fromSetting } });
  if (found) return found.id;
  const fallback = await prisma.quoteContentProfile.findFirst({ where: { isDefault: true } });
  return fallback?.id ?? null;
}

export async function ensureQuoteSections(quoteId: string, profileKey = "tecnico") {
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: { sections: true, contentProfile: true },
  });
  if (!quote) return;
  const bodies = await resolveQuoteModuleBodies();
  const key = quote.contentProfile?.key || profileKey;
  const enabled = new Set(
    (Array.isArray(quote.contentProfile?.sectionKeys) ? (quote.contentProfile!.sectionKeys as string[]) : null) ??
      QUOTE_MODULES.filter((m) => m.defaultOn.includes(key as "tecnico")).map((m) => m.key)
  );
  const existing = new Set(quote.sections.map((s) => s.type));
  for (const section of quote.sections) {
    const def = moduleByKey(section.type);
    const nextBody = bodies[section.type] || "";
    if (section.body.trim()) continue;
    if (!nextBody.trim()) continue;
    if (def?.kind === "ai" && section.body.trim()) continue;
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: { body: nextBody },
    });
  }
  let sort = quote.sections.reduce((m, s) => Math.max(m, s.sortOrder), -1);
  for (const mod of QUOTE_MODULES) {
    if (existing.has(mod.key)) continue;
    sort += 1;
    await prisma.quoteSection.create({
      data: {
        quoteId,
        type: mod.key,
        title: mod.title,
        body: bodies[mod.key] || mod.body,
        origin: mod.kind === "fixed" ? "CORPORATE" : mod.kind === "table" ? "TEMPLATE" : "PROJECT",
        source: "TEMPLATE",
        locked: mod.kind === "fixed",
        included: enabled.has(mod.key),
        sortOrder: sort,
        sourceBlockKey: mod.key,
        sourceBlockVersion: 1,
      },
    });
  }
}
