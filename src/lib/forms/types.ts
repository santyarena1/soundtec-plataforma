/**
 * Formularios tipo Typeform: definición de bloques, configuración y validación
 * de respuestas. Lo usan el editor del panel, la página pública /f/[token] y
 * el guardado de respuestas, así las tres partes validan igual.
 */
import { z } from "zod";

export const QUESTION_TYPES = [
  "short_text",
  "long_text",
  "email",
  "phone",
  "number",
  "date",
  "single_choice",
  "multi_choice",
  "dropdown",
  "yes_no",
  "scale",
  "consent",
  "brand_choice",
] as const;

export const CONTENT_TYPES = ["statement", "image", "video", "map", "agenda"] as const;

export type QuestionType = (typeof QUESTION_TYPES)[number];
export type ContentType = (typeof CONTENT_TYPES)[number];
export type BlockType = QuestionType | ContentType;

export function isQuestionType(type: string): type is QuestionType {
  return (QUESTION_TYPES as readonly string[]).includes(type);
}

export function isBlockType(type: string): type is BlockType {
  return isQuestionType(type) || (CONTENT_TYPES as readonly string[]).includes(type);
}

export const BLOCK_LABELS: Record<BlockType, { label: string; hint: string; group: "Preguntas" | "Opciones" | "Contenido" }> = {
  short_text: { label: "Texto corto", hint: "Nombre, empresa, cargo…", group: "Preguntas" },
  long_text: { label: "Texto largo", hint: "Comentarios o consultas", group: "Preguntas" },
  email: { label: "Email", hint: "Valida el formato", group: "Preguntas" },
  phone: { label: "Teléfono", hint: "Celular o fijo", group: "Preguntas" },
  number: { label: "Número", hint: "Cantidad de acompañantes, etc.", group: "Preguntas" },
  date: { label: "Fecha", hint: "Elegir un día", group: "Preguntas" },
  single_choice: { label: "Opción única", hint: "Elige una sola", group: "Opciones" },
  multi_choice: { label: "Varias opciones", hint: "Puede elegir varias", group: "Opciones" },
  dropdown: { label: "Desplegable", hint: "Lista larga de opciones", group: "Opciones" },
  yes_no: { label: "Sí / No", hint: "Respuesta rápida", group: "Opciones" },
  scale: { label: "Escala", hint: "Del 1 al 10 (o el rango que elijas)", group: "Opciones" },
  consent: { label: "Aceptación", hint: "Casilla «Acepto…»", group: "Opciones" },
  brand_choice: { label: "Marcas", hint: "Logos de las marcas para elegir", group: "Opciones" },
  statement: { label: "Pantalla de texto", hint: "Título y texto, sin respuesta", group: "Contenido" },
  image: { label: "Imagen", hint: "Una imagen a pantalla completa (tipo diapositiva)", group: "Contenido" },
  video: { label: "Video", hint: "YouTube, Vimeo o archivo subido", group: "Contenido" },
  map: { label: "Mapa", hint: "Ubicación desde un enlace de Google Maps", group: "Contenido" },
  agenda: { label: "Programa", hint: "Horarios de lo que pasa en el evento", group: "Contenido" },
};

/** Un momento del programa del evento: hora, qué pasa y un detalle opcional. */
export const agendaItemSchema = z.object({ time: z.string().max(20), title: z.string().max(200), detail: z.string().max(500).optional() });
export type AgendaItem = z.infer<typeof agendaItemSchema>;

/** Un dato útil de la pantalla de cierre (Dirección, Fecha, Horario, Estacionamiento…). */
export const infoItemSchema = z.object({ label: z.string().max(60), value: z.string().max(300) });
export type InfoItem = z.infer<typeof infoItemSchema>;

/** Configuración de cada bloque (JSON en FormBlock.config). Todo opcional. */
export const blockConfigSchema = z
  .object({
    placeholder: z.string().max(200).optional(),
    buttonLabel: z.string().max(60).optional(),
    options: z.array(z.string().max(300)).max(60).optional(),
    /** Opción única / varias: suma «Otra» con texto libre. */
    allowOther: z.boolean().optional(),
    /** Varias opciones: mínimo y máximo de elegidas. */
    minChoices: z.number().int().min(0).max(60).optional(),
    maxChoices: z.number().int().min(0).max(60).optional(),
    /** Número y escala. */
    min: z.number().optional(),
    max: z.number().optional(),
    minLabel: z.string().max(60).optional(),
    maxLabel: z.string().max(60).optional(),
    /** Texto largo: máximo de caracteres. */
    maxLength: z.number().int().min(1).max(10000).optional(),
    /** Imagen o archivo de video subidos, o URL externa. */
    mediaUrl: z.string().max(2000).optional(),
    mediaAlt: z.string().max(300).optional(),
    /** Video de YouTube o Vimeo (URL normal; se convierte a embed). */
    videoUrl: z.string().max(2000).optional(),
    /** Mapa: dirección o enlace de Google Maps. */
    mapQuery: z.string().max(1000).optional(),
    mapLink: z.string().max(2000).optional(),
    /** Enlace corto de Google Maps ya resuelto al guardar (para mostrar el mapa). */
    mapResolved: z.string().max(4000).optional(),
    /** Programa: horarios del evento. */
    agenda: z.array(agendaItemSchema).max(40).optional(),
    /** Imagen que acompaña a una pregunta (al costado). */
    sideImageUrl: z.string().max(2000).optional(),
    /** Va en la misma pantalla que el bloque anterior (varios campos juntos). */
    groupWithPrevious: z.boolean().optional(),
    /** Marcas: ids de las marcas a mostrar (vacío = todas las del catálogo). */
    brandIds: z.array(z.string().max(60)).max(200).optional(),
    /** Marcas: logos por nombre (lo completa el servidor al mostrar el formulario; no se guarda). */
    brandLogos: z.record(z.string(), z.string()).optional(),
  })
  .partial();

export type BlockConfig = z.infer<typeof blockConfigSchema>;

export function readConfig(value: unknown): BlockConfig {
  const parsed = blockConfigSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

/** Pantallas de bienvenida y cierre + opciones del formulario (JSON en Form.settings). */
export const formSettingsSchema = z
  .object({
    welcomeTitle: z.string().max(200).optional(),
    welcomeBody: z.string().max(20000).optional(),
    welcomeImageUrl: z.string().max(2000).optional(),
    /** Logo propio del formulario: reemplaza al de Soundtec arriba y va grande en la bienvenida. */
    logoUrl: z.string().max(2000).optional(),
    welcomeButton: z.string().max(60).optional(),
    endTitle: z.string().max(200).optional(),
    endBody: z.string().max(20000).optional(),
    endImageUrl: z.string().max(2000).optional(),
    /** Cierre: datos útiles, mapa con «Cómo llegar» y programa del evento. */
    endInfo: z.array(infoItemSchema).max(12).optional(),
    endMapQuery: z.string().max(1000).optional(),
    endMapResolved: z.string().max(4000).optional(),
    endAgenda: z.array(agendaItemSchema).max(40).optional(),
    /** Mails que reciben aviso de cada respuesta (cuando esté Resend). */
    notifyEmails: z.array(z.string().email()).max(20).optional(),
    /** Fondo: blanco liso, blanco con degradé azul, gris claro u oscuro (azul Soundtec). */
    theme: z.enum(["white", "light", "gray", "dark"]).optional(),
    /** Color de botones, selección y barra de progreso. */
    accent: z.enum(["blue", "black"]).optional(),
    /** Invitación por mail: asunto, texto ({nombre} y {empresa} se reemplazan) y botón. */
    inviteSubject: z.string().max(200).optional(),
    inviteMessage: z.string().max(5000).optional(),
    inviteButton: z.string().max(60).optional(),
    /** Partículas muy sutiles en azul Soundtec sobre el fondo. */
    particles: z.boolean().optional(),
  })
  .partial();

export type FormSettings = z.infer<typeof formSettingsSchema>;

export function readSettings(value: unknown): FormSettings {
  const parsed = formSettingsSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : {};
}

export type PublicBlock = {
  id: string;
  type: BlockType;
  title: string;
  body: string;
  required: boolean;
  config: BlockConfig;
};

/** Cookie que marca que este navegador ya respondió el formulario. */
export function formDoneCookie(formId: string): string {
  return `form_done_${formId}`;
}

export type AnswerValue = string | number | boolean | string[] | null;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[+()\-\s\d]{6,24}$/;
export const OTHER_PREFIX = "Otra: ";

/** Valida una respuesta. Devuelve el valor normalizado o un mensaje de error para quien responde. */
export function validateAnswer(block: PublicBlock, raw: unknown): { ok: true; value: AnswerValue } | { ok: false; error: string } {
  const empty = raw == null || raw === "" || (Array.isArray(raw) && raw.length === 0) || raw === false;
  if (!isQuestionType(block.type)) return { ok: true, value: null };
  if (empty) {
    if (block.required) {
      return { ok: false, error: block.type === "consent" ? "Tenés que aceptar para seguir." : "Esta pregunta es obligatoria." };
    }
    return { ok: true, value: null };
  }
  const c = block.config;
  const text = typeof raw === "string" ? raw.trim() : "";
  switch (block.type) {
    case "short_text":
      return text.length <= 500 ? { ok: true, value: text } : { ok: false, error: "Es demasiado largo." };
    case "long_text": {
      const max = c.maxLength ?? 5000;
      return text.length <= max ? { ok: true, value: text } : { ok: false, error: `Máximo ${max} caracteres.` };
    }
    case "email":
      return EMAIL_RE.test(text) ? { ok: true, value: text.toLowerCase() } : { ok: false, error: "Revisá el email: parece incompleto." };
    case "phone":
      return PHONE_RE.test(text) ? { ok: true, value: text } : { ok: false, error: "Ingresá un teléfono válido (solo números, espacios, + o -)." };
    case "number": {
      const n = Number(String(raw).replace(",", "."));
      if (!Number.isFinite(n)) return { ok: false, error: "Ingresá un número." };
      if (c.min != null && n < c.min) return { ok: false, error: `El mínimo es ${c.min}.` };
      if (c.max != null && n > c.max) return { ok: false, error: `El máximo es ${c.max}.` };
      return { ok: true, value: n };
    }
    case "date":
      return /^\d{4}-\d{2}-\d{2}$/.test(text) ? { ok: true, value: text } : { ok: false, error: "Elegí una fecha." };
    case "single_choice":
    case "dropdown": {
      const options = c.options ?? [];
      if (options.includes(text)) return { ok: true, value: text };
      if (c.allowOther && text.startsWith(OTHER_PREFIX) && text.length > OTHER_PREFIX.length) return { ok: true, value: text.slice(0, 500) };
      return { ok: false, error: "Elegí una de las opciones." };
    }
    case "multi_choice":
    case "brand_choice": {
      const list = (Array.isArray(raw) ? raw : []).map((v) => String(v).trim()).filter(Boolean);
      const options = c.options ?? [];
      const valid = list.every((v) => options.includes(v) || (c.allowOther && v.startsWith(OTHER_PREFIX)));
      if (!valid) return { ok: false, error: "Elegí entre las opciones." };
      if (c.minChoices && list.length < c.minChoices) return { ok: false, error: `Elegí al menos ${c.minChoices}.` };
      if (c.maxChoices && list.length > c.maxChoices) return { ok: false, error: `Elegí como máximo ${c.maxChoices}.` };
      return { ok: true, value: list };
    }
    case "yes_no":
      return raw === "Sí" || raw === "No" ? { ok: true, value: raw } : { ok: false, error: "Elegí Sí o No." };
    case "scale": {
      const n = Number(raw);
      const min = c.min ?? 1;
      const max = c.max ?? 10;
      return Number.isInteger(n) && n >= min && n <= max ? { ok: true, value: n } : { ok: false, error: `Elegí un valor de ${min} a ${max}.` };
    }
    case "consent":
      return raw === true ? { ok: true, value: true } : { ok: false, error: "Tenés que aceptar para seguir." };
    default:
      return { ok: true, value: null };
  }
}

/** Respuesta lista para mostrar o exportar. */
export function answerToText(value: unknown): string {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (value === true) return "Sí, acepta";
  return String(value);
}

/** YouTube / Vimeo → URL de embed. Null si no es un enlace reconocido. */
export function videoEmbedUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
  if (yt) return `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  const vimeo = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

/**
 * Lugar a partir de una dirección o un enlace de Google Maps (ya resuelto si era
 * corto): primero el pin exacto del enlace, después el nombre del lugar, el
 * parámetro q y por último el centro del mapa.
 */
export function mapPlace(query: string | undefined | null): string | null {
  const q = (query ?? "").trim();
  if (!q) return null;
  if (!/^https?:\/\//i.test(q)) return q;
  const pin = q.match(/!3d(-?\d+\.\d+)!4d(-?\d+\.\d+)/);
  if (pin) return `${pin[1]},${pin[2]}`;
  const place = q.match(/\/place\/([^/@?]+)/);
  if (place) return decodeURIComponent(place[1].replace(/\+/g, " "));
  try {
    const params = new URL(q).searchParams;
    const param = params.get("q") ?? params.get("query") ?? params.get("destination");
    if (param) return param;
  } catch {
    return null;
  }
  const center = q.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
  return center ? `${center[1]},${center[2]}` : null;
}

/** Dirección o enlace de Google Maps → URL de embed (sin clave de API). */
export function mapEmbedUrl(query: string | undefined | null): string | null {
  const place = mapPlace(query);
  return place ? `https://www.google.com/maps?q=${encodeURIComponent(place)}&output=embed` : null;
}

/** «Cómo llegar»: abre Google Maps con el recorrido hasta el lugar desde donde esté la persona. */
export function mapDirectionsUrl(query: string | undefined | null): string | null {
  const place = mapPlace(query);
  return place ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(place)}` : null;
}

/** Enlace para abrir el mapa en Google Maps. */
export function mapOpenUrl(block: { config: BlockConfig }): string | null {
  const link = block.config.mapLink?.trim();
  if (link && /^https?:\/\//i.test(link)) return link;
  const q = block.config.mapQuery?.trim();
  if (!q) return null;
  if (/^https?:\/\//i.test(q)) return q;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}
