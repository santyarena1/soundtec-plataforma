/**
 * Glosario de términos de proveedores (en inglés) → término del rubro AV en
 * Argentina. Único lugar para estas traducciones: lo usa el código que muestra
 * texto del proveedor en español (ficha, SoundTube, importadores).
 *
 * Criterio (pedido del dueño): NO traducir literal palabra por palabra. Cada
 * entrada dice qué es la pieza y qué término se usa acá. Lo que en el rubro se
 * dice en inglés tal cual (Keypad, Dimmer, Subwoofer…) queda en inglés
 * (status «english»). Lo dudoso queda en el original con status «review».
 *
 * Los nombres de SERIE (Horizon, Landscape, CBL…) son nombres propios: no
 * pasan por acá (ver lib/product-lines/detect.ts).
 */

export type GlossaryStatus = "ok" | "english" | "review";

export type GlossaryEntry = {
  /** Término del proveedor (inglés, como viene). */
  term: string;
  /** Cómo se muestra en español (o el original si es «english»/«review»). */
  es: string;
  status: GlossaryStatus;
  /** Qué es y por qué se eligió ese término. */
  note: string;
};

export const SUPPLIER_GLOSSARY: readonly GlossaryEntry[] = [
  // Ubicación / montaje (Sonance «productLine», atributos de instalación)
  { term: "In-Ceiling", es: "Embutido de techo", status: "ok", note: "Parlante que se embute en el cielorraso; «de techo» a secas puede confundirse con colgante." },
  { term: "In-Wall", es: "Embutido de pared", status: "ok", note: "Se embute en la pared (Durlock o mampostería)." },
  { term: "In-Wall In-Ceiling", es: "Embutido de pared o techo", status: "ok", note: "Modelos que sirven para los dos montajes." },
  { term: "Surface Mount", es: "De superficie", status: "ok", note: "Va apoyado/atornillado sobre la pared o el techo, sin embutir." },
  { term: "On-Wall", es: "De superficie (pared)", status: "ok", note: "Caja colgada sobre la pared." },
  { term: "Pendant", es: "Colgante", status: "ok", note: "Parlante suspendido del techo con cable." },
  { term: "Outdoor", es: "Exterior", status: "ok", note: "Apto intemperie." },
  { term: "Outdoor Above Ground", es: "Exterior sobre el suelo", status: "ok", note: "Parlantes de jardín que van sobre el piso o en estaca (Landscape)." },
  { term: "Outdoor In-Ground", es: "Exterior enterrado", status: "ok", note: "Subwoofer de jardín que se entierra y deja la boca afuera." },
  { term: "Cabinet", es: "Cabinet", status: "review", note: "En Sonance indica parlantes para dentro de un mueble; sin confirmar el término que usa el equipo." },

  // Partes del parlante embutido
  { term: "Grille", es: "Rejilla", status: "ok", note: "Frente perforado del parlante. No «reja»." },
  { term: "Trim Kit", es: "Kit de terminación", status: "ok", note: "Aro o marco que cubre el corte; según el caso, «aro de terminación»." },
  { term: "Trim Ring", es: "Aro de terminación", status: "ok", note: "Aro visible alrededor de la rejilla." },
  { term: "Backbox", es: "Caja de empotrar", status: "ok", note: "Caja trasera que se embute antes del parlante." },
  { term: "Back Can", es: "Caja de empotrar", status: "ok", note: "Mismo uso que backbox (Sonance «backcan»)." },
  { term: "Enclosure", es: "Caja acústica trasera", status: "ok", note: "Caja cerrada detrás del parlante embutido (mejora graves y aísla)." },
  { term: "Mud Ring", es: "Bastidor de obra nueva", status: "ok", note: "Marco que se fija antes del yeso para dejar el hueco." },
  { term: "New Construction Bracket", es: "Bastidor de obra nueva", status: "ok", note: "Soporte que se instala con la estructura, antes de cerrar la pared." },
  { term: "Rough-in", es: "Plataforma de embutir", status: "ok", note: "Pieza de pre-instalación que marca y sostiene el hueco." },
  { term: "Bracket", es: "Soporte", status: "ok", note: "Soporte de montaje genérico." },
  { term: "Mount", es: "Soporte", status: "ok", note: "Soporte de montaje (pared, mesa, techo)." },
  { term: "Toe Kick", es: "Zócalo", status: "ok", note: "Rejilla o parlante que va en el zócalo del mueble." },
  { term: "Gypsum Board", es: "Placa de yeso (Durlock)", status: "ok", note: "TRUFIG: piezas para placa de yeso; en obra se dice Durlock." },
  { term: "Fascia", es: "Fascia", status: "review", note: "TRUFIG: tapa de terminación al ras de la pared; falta confirmar cómo la nombra el equipo." },
  { term: "Module", es: "Módulo", status: "ok", note: "Parlante sin rejilla ni caja, para armar el kit." },

  // Tipos de equipo
  { term: "Speaker", es: "Parlante", status: "ok", note: "No «altavoz». «Bafle» para cajas de piso/estante." },
  { term: "Accessory", es: "Accesorio", status: "ok", note: "" },
  { term: "Soundbar", es: "Barra de sonido", status: "ok", note: "" },
  { term: "Amplifier", es: "Amplificador", status: "ok", note: "" },
  { term: "Amp", es: "Amplificador", status: "ok", note: "" },
  { term: "DSP Amplifier", es: "Amplificador con DSP", status: "ok", note: "DSP queda en inglés (procesador digital)." },
  { term: "Digital Amplifier", es: "Amplificador digital", status: "ok", note: "" },
  { term: "Subwoofer", es: "Subwoofer", status: "english", note: "Se usa en inglés en el rubro." },
  { term: "Bandpass Subwoofer", es: "Subwoofer bandpass", status: "english", note: "Tipo de caja; se dice en inglés." },
  { term: "LCR", es: "LCR", status: "english", note: "Parlante izquierdo/central/derecho para home theater; sigla usada tal cual." },
  { term: "Volume Control", es: "Control de volumen", status: "ok", note: "" },
  { term: "Speaker Selector", es: "Selector de parlantes", status: "ok", note: "" },
  { term: "Kit", es: "Kit", status: "ok", note: "" },
  { term: "Configured Kit", es: "Configured Kit", status: "review", note: "James: parlante armado con sus opciones; falta definir el término (¿«kit armado»?)." },
  { term: "Case", es: "Funda", status: "ok", note: "IPORT: funda para iPad." },
  { term: "Dock", es: "Base de carga", status: "ok", note: "IPORT: base donde se apoya la tablet para cargar." },

  // Control e iluminación (Crestron)
  { term: "Keypad", es: "Keypad", status: "english", note: "Se usa en inglés en el rubro (indicación del dueño)." },
  { term: "Keypad Buttons", es: "Botones para keypad", status: "ok", note: "Teclas intercambiables del keypad." },
  { term: "Dimmer", es: "Dimmer", status: "english", note: "Se usa en inglés." },
  { term: "Touch Panel", es: "Pantalla táctil", status: "ok", note: "" },
  { term: "Touchscreen", es: "Pantalla táctil", status: "ok", note: "" },
  { term: "Faceplate", es: "Tapa", status: "ok", note: "Tapa de terminación de keypad/dimmer." },
  { term: "Wallplate", es: "Placa de pared", status: "ok", note: "Placa con conectores o tapa ciega." },
  { term: "Thermostat", es: "Termostato", status: "ok", note: "" },
  { term: "Occupancy Sensor", es: "Sensor de presencia", status: "ok", note: "" },
  { term: "Shades", es: "Cortinas motorizadas", status: "ok", note: "" },
  { term: "Power Supply", es: "Fuente de alimentación", status: "ok", note: "" },

  // Segmentos de SoundTube (ya vienen en español; se normaliza la forma)
  { term: "Comercial", es: "Comercial", status: "ok", note: "Segmento de la lista de SoundTube." },
  { term: "Residencial", es: "Residencial", status: "ok", note: "Segmento de la lista de SoundTube." },
  { term: "Exterior", es: "Exterior", status: "ok", note: "Segmento de la lista de SoundTube." },
  { term: "Electronica", es: "Electrónica", status: "ok", note: "Segmento de SoundTube, viene sin tilde." },
  { term: "Pro Audio", es: "Audio profesional", status: "ok", note: "Segmento de SoundTube." },
];

function key(term: string): string {
  return term
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[-_/]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BY_KEY = new Map(SUPPLIER_GLOSSARY.map((e) => [key(e.term), e]));

export type GlossaryLookup = { es: string; status: GlossaryStatus | "unknown" };

/** Un término suelto. Desconocido → el original, marcado «unknown». */
export function lookupSupplierTerm(term: string): GlossaryLookup {
  const t = term.trim();
  const hit = BY_KEY.get(key(t));
  return hit ? { es: hit.es, status: hit.status } : { es: t, status: "unknown" };
}

/**
 * Texto del proveedor para mostrar en español. Acepta compuestos separados por
 * « · » o « / » («Cabinet · In-Wall»). Lo que no está en el glosario queda igual.
 */
export function supplierTermEs(raw: string | null | undefined): string | null {
  const v = (raw ?? "").trim();
  if (!v) return null;
  const whole = BY_KEY.get(key(v));
  if (whole) return whole.es;
  const parts = v.split(/\s+[·/]\s+/).map((p) => lookupSupplierTerm(p).es);
  return [...new Set(parts)].join(" · ");
}
