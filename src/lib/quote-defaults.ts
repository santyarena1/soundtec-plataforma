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
  /**
   * Se sube cuando el texto fijo cambia en el código. Al subirlo, los bloques y
   * las secciones que todavía vienen de plantilla se refrescan solos; lo que el
   * usuario haya editado a mano queda intacto.
   */
  templateVersion?: number;
};

export function moduleVersion(mod: QuoteModuleDef) {
  return mod.templateVersion ?? 1;
}

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
    body: `SOUNDTEC es PARTNER AUTORIZADO y distribuidor para todo el territorio de la República Argentina de los fabricantes de los productos que son objeto de este presupuesto, por ende, contamos con su autorización para la comercialización, instalación, y servicio técnico.

Nuestro personal técnico y comercial está certificado y/o calificado por los fabricantes de los productos cotizados para cada una de las distintas especialidades y soluciones que brinda cada marca.

¿Cuántas compañías con Especialización Audiovisual y a la vez CERTIFICACIÓN ISO 9001 hay en Argentina? …sólo una.

SOUNDTEC, con más de 35 años de trayectoria, es hoy la única compañía argentina que puede ofrecer sus servicios en materia audiovisual con el respaldo que dan las grandes marcas que comercializa y a la vez con el respaldo y seriedad que implica tener todos sus procedimientos certificados bajo normas de calidad internacionales ISO 9001.`,
    defaultOn: ["tecnico", "premium"],
    templateVersion: 2,
  },
  {
    key: "disciplines",
    title: "Disciplinas",
    kind: "fixed",
    description: "Franja opcional Audio · Video · Iluminación · UC · Control. No está en la COT Word.",
    body: "Audio profesional · Video · Iluminación · Unified Communications · Control e integración.",
    defaultOn: [],
  },
  {
    key: "brands",
    title: "Marcas",
    kind: "fixed",
    description: "Collage institucional de marcas (fijo de plantilla Word).",
    body: `SOUNDTEC es también Partner certificado de las siguientes marcas:

… entre otras más de 70 marcas.`,
    defaultOn: ["tecnico", "premium"],
    templateVersion: 2,
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
    title: "Condiciones generales de servicio",
    kind: "fixed",
    description: "Alcance de obra, materiales, supuestos y responsabilidades. Texto fijo de la COT Word.",
    body: `ALCANCE DE LOS TRABAJOS
Esta propuesta incluye la provisión de personal técnico especializado de SOUNDTEC S.R.L. para el montaje, instalación y puesta en marcha del sistema, durante el período que resulte necesario para completar los trabajos. El cronograma de tareas será acordado previamente con el responsable designado por el cliente. Durante la instalación, el personal deberá contar con acceso libre y sin restricciones dentro de los horarios establecidos.

Se contempla la presencia de un supervisor de SOUNDTEC para definir detalles de instalación y realizar el seguimiento presencial del avance de los trabajos durante todo el proceso.

MATERIALES DE INSTALACIÓN
Se incluyen de manera estimativa todos los materiales e insumos necesarios para la correcta instalación del sistema, tales como cables, conectores, accesorios específicos e insumos menores.

CONSIDERACIONES GENERALES DE INSTALACIÓN
La instalación se realizará considerando las características arquitectónicas del edificio y siguiendo los estándares profesionales del rubro. Esta etapa incluye también el entrenamiento básico al personal designado por el cliente sobre el uso y funcionamiento del sistema.

La instalación no incluye canalizaciones, ni trabajos de gremios (mampostería, carpintería, pintura, herrería, etc.), salvo que hayan sido expresamente acordados.

Se asume que las cañerías existentes están en condiciones adecuadas y con capacidad suficiente para el tendido de cables, y que los cielorrasos y superficies donde se deba fijar equipamiento están aptos estructuralmente para dicha tarea. Cualquier intervención adicional requerida por fuera de estos supuestos será responsabilidad del cliente.

CONDICIONES DE SEGURIDAD Y OPERATIVAS
El personal técnico de SOUNDTEC no realizará tareas en condiciones de riesgo ni bajo condiciones climáticas adversas. La imposibilidad de brindar el servicio por estas causas será considerada ajena a SOUNDTEC.

RESPONSABLE POR PARTE DEL CLIENTE
El cliente deberá designar a una persona responsable para la coordinación general de los trabajos, incluyendo: ingreso de personal, movimiento de materiales, recepción de mercadería, gestión de horarios y cualquier otra necesidad operativa relacionada con la instalación.`,
    defaultOn: ["tecnico", "premium"],
    templateVersion: 2,
  },
  {
    key: "staff",
    title: "Personal técnico",
    kind: "fixed",
    description: "Staff, ART, uniforme, certificaciones. Texto fijo de la COT Word.",
    body: `La capacitación continua y la idoneidad de nuestro equipo técnico constituyen un factor diferencial clave de SOUNDTEC.

Todo el staff técnico se forma de manera permanente en tecnologías y metodologías específicas, cumpliendo con certificaciones oficiales de fabricantes y organismos internacionales como AVIXA, CEDIA, AUDINATE, CRESTRON, SOUNDTUBE, ATLONA, entre otros.

SOUNDTEC es la única empresa integradora de servicios audiovisuales del país certificada bajo norma ISO 9001, con alcance efectivo sobre todos sus procesos de servicio y producción. Esta certificación se mantiene en forma ininterrumpida desde 2006, con auditorías y renovaciones anuales.

Nuestro personal técnico se presenta uniformado, cumple con la normativa laboral vigente y cuenta con ART y Seguro de Vida Obligatorio.

Cada técnico asignado ha sido entrenado en metodologías de trabajo seguro y utiliza los elementos de protección personal adecuados a cada tarea. En SOUNDTEC, la seguridad es una práctica activa que garantiza la integridad de nuestro equipo y de las instalaciones donde intervenimos.`,
    defaultOn: ["tecnico", "premium"],
    templateVersion: 2,
  },
  {
    key: "commercial_terms",
    title: "Condiciones comerciales",
    kind: "fixed",
    description: "Precio, BNA, forma de pago, vigencia. Campos de empresa.",
    body: `PRECIO
Los precios detallados en esta propuesta están expresados en dólares estadounidenses (Dólar Oficial) y no incluyen IVA.

REFERENCIA DE PAGO
El pago podrá efectuarse en pesos argentinos, utilizando como referencia la cotización del tipo de cambio billete, tipo vendedor del Banco de la Nación Argentina (BNA) vigente al día de la cancelación efectiva de la factura.

FORMA DE PAGO
Para la presente propuesta comercial se ha considerado la siguiente condición de pago: A CONVENIR.

MANTENIMIENTO DE LA OFERTA
La presente oferta se mantiene vigente por un período de cinco (5) días corridos a partir de la fecha de emisión, para los valores indicados.

PLAZO DE ENTREGA
El plazo de entrega será confirmado una vez recibida la orden de compra formal. En la última columna de la planilla de cotización se indica la disponibilidad tentativa del equipamiento cotizado, sujeta a confirmación y salvo venta previa. Los plazos comenzarán a contarse a partir del cumplimiento efectivo de las condiciones comerciales acordadas.`,
    defaultOn: ["resumido", "tecnico", "premium"],
    templateVersion: 2,
  },
  {
    key: "warranty",
    title: "Garantía de productos",
    kind: "fixed",
    description: "12 meses salvo indicación en la planilla.",
    body: `Salvo indicación en contrario dentro de la planilla de cotización, todos los productos incluidos en esta propuesta gozarán de una garantía de 12 meses a partir de la fecha de su facturación, contra vicios de fabricación, y de acuerdo con el certificado de garantía entregado con cada equipo.`,
    defaultOn: ["resumido", "tecnico", "premium"],
    templateVersion: 2,
  },
  {
    key: "satisfaction",
    title: "Garantía de satisfacción",
    kind: "fixed",
    description: "Referencias de clientes. Texto fijo de la COT Word.",
    body: `Nuestra mejor carta de presentación son nuestros clientes, quienes dan crédito a nuestras palabras, no sólo porque nos eligieron, sino porque nos siguen eligiendo.

Ponemos a su disposición nuestra carpeta de presentación en la cual adjuntamos un listado de nuestros principales clientes.`,
    defaultOn: ["tecnico", "premium"],
  },
  {
    key: "iso",
    title: "Calidad certificada ISO 9001",
    kind: "fixed",
    description: "Sellos IRAM / IQNet y texto de certificación.",
    body: `SOUNDTEC S.R.L. es la primera y única empresa argentina del sector sonido, iluminación, video y videoconferencia profesional en obtener la certificación de su Sistema de Gestión de la Calidad conforme a las normas internacionales ISO 9001, avalada por el Instituto Argentino de Normalización y Certificación (IRAM).

En el año 2006 obtuvo su primera certificación bajo la norma ISO 9001:2000, y desde entonces ha mantenido su sistema actualizado a las versiones vigentes.

ALCANCE DE LA CERTIFICACIÓN
Ventas y alquileres; servicio técnico; eventos; diseño, realización y mantenimiento de instalaciones de equipos y sistemas de sonido, video, iluminación y videoconferencia para todo tipo de aplicación.

NUESTRA POLÍTICA DE CALIDAD
SOUNDTEC s.r.l. es una empresa orientada a lograr altos niveles de satisfacción de sus clientes, acercando las innovaciones tecnológicas y proponiendo soluciones integrales, cumpliendo con los requisitos acordados para sus prestaciones. Nuestra organización se compromete a mejorar de forma continua la eficacia del Sistema de Gestión de la Calidad, demostrando así su compromiso con la excelencia en todos los niveles de la empresa.`,
    defaultOn: ["tecnico", "premium"],
    templateVersion: 2,
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

export type ImagePlacement = { width: number; align: "left" | "center" | "right" };

/** El ancho va en % del ancho útil de la hoja, así la imagen sigue fluyendo con el texto. */
function parsePlacement(width: string, align: string, fallbackWidth: number): ImagePlacement {
  const parsed = Number(width);
  const safeWidth = Number.isFinite(parsed) && parsed >= 10 && parsed <= 100 ? parsed : fallbackWidth;
  const safeAlign = align === "left" || align === "right" ? align : "center";
  return { width: safeWidth, align: safeAlign };
}

export async function getCompanyIdentity() {
  const [
    name,
    tagline,
    address,
    phone,
    email,
    web,
    logoUrl,
    headerUrl,
    brandsUrl,
    isoUrl,
    primary,
    brandsWidth,
    brandsAlign,
    isoWidth,
    isoAlign,
  ] = await Promise.all([
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
    getSetting(QUOTE_SETTING_KEYS.brandsWidth, "100"),
    getSetting(QUOTE_SETTING_KEYS.brandsAlign, "center"),
    getSetting(QUOTE_SETTING_KEYS.isoWidth, "30"),
    getSetting(QUOTE_SETTING_KEYS.isoAlign, "center"),
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
    brands: parsePlacement(brandsWidth, brandsAlign, 100),
    iso: parsePlacement(isoWidth, isoAlign, 30),
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
    const version = moduleVersion(m);
    // El body sólo se escribe al crear la versión: si la editaste desde la
    // configuración del módulo, tu texto manda hasta que suba la versión.
    await prisma.quoteBlock.upsert({
      where: { key_version: { key: m.key, version } },
      update: { title: m.title, category: m.kind, isActive: true },
      create: { key: m.key, version, title: m.title, category: m.kind, body: m.body, isActive: true },
    });
    await prisma.quoteBlock.updateMany({
      where: { key: m.key, version: { not: version }, isActive: true },
      data: { isActive: false },
    });
  }
}

export async function resolveQuoteModuleBodies(): Promise<Record<string, string>> {
  await ensureQuoteProfiles();
  const blocks = await prisma.quoteBlock.findMany({ where: { isActive: true } });
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
    if (!nextBody.trim()) continue;

    if (!section.body.trim()) {
      await prisma.quoteSection.update({ where: { id: section.id }, data: { body: nextBody } });
      continue;
    }

    // La sección tiene texto. Sólo se reemplaza si sigue siendo el de plantilla
    // y esa plantilla quedó vieja: lo escrito a mano o por IA no se toca.
    if (!def || def.kind === "ai") continue;
    if (section.source !== "TEMPLATE") continue;
    const version = moduleVersion(def);
    if ((section.sourceBlockVersion ?? 1) >= version) continue;
    await prisma.quoteSection.update({
      where: { id: section.id },
      data: { title: def.title, body: nextBody, sourceBlockVersion: version },
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
        sourceBlockVersion: moduleVersion(mod),
      },
    });
  }
}
