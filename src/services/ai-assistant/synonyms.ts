/**
 * Puente español → inglés para el retrieval.
 *
 * Las fichas vienen de los fabricantes y están en inglés ("outdoor",
 * "speaker", "weather resistant"), pero el visitante pregunta en español.
 * Sin esta traducción, "parlante para exterior" no matchea nada.
 *
 * Es un diccionario, no una llamada al modelo: cuesta 0 tokens.
 */

const SYNONYMS: Record<string, string[]> = {
  // Tipos de producto
  parlante: ["speaker", "loudspeaker", "parlante"],
  parlantes: ["speaker", "loudspeaker", "parlante"],
  altavoz: ["speaker", "loudspeaker"],
  altavoces: ["speaker", "loudspeaker"],
  bafle: ["speaker", "loudspeaker", "cabinet"],
  subwoofer: ["subwoofer", "sub"],
  amplificador: ["amplifier", "amplificador", "amp"],
  amplificadores: ["amplifier", "amplificador"],
  micrófono: ["microphone", "microfono"],
  microfono: ["microphone"],
  mezclador: ["mixer"],
  consola: ["mixer", "console"],
  procesador: ["processor", "dsp", "procesador"],
  controlador: ["controller", "control system"],
  pantalla: ["display", "screen"],
  proyector: ["projector"],
  cámara: ["camera", "camara"],
  camara: ["camera"],
  soporte: ["mount", "bracket", "soporte"],
  cable: ["cable"],
  matriz: ["matrix", "switcher"],
  receptor: ["receiver"],
  transmisor: ["transmitter"],

  // Aplicación y ambiente
  exterior: ["outdoor", "weather", "exterior", "all-weather"],
  intemperie: ["outdoor", "weather", "all-weather"],
  pileta: ["outdoor", "pool", "weather"],
  piscina: ["outdoor", "pool", "weather"],
  jardin: ["outdoor", "landscape", "garden"],
  jardín: ["outdoor", "landscape", "garden"],
  terraza: ["outdoor", "patio", "weather"],
  patio: ["outdoor", "patio"],
  interior: ["indoor", "in-ceiling", "in-wall"],
  techo: ["ceiling", "in-ceiling"],
  cielorraso: ["ceiling", "in-ceiling"],
  pared: ["wall", "in-wall", "surface mount"],
  embutir: ["in-ceiling", "in-wall", "flush"],
  empotrar: ["in-ceiling", "in-wall", "flush"],
  rack: ["rack", "rack-mount"],
  restaurante: ["restaurant", "background music", "commercial"],
  bar: ["bar", "restaurant", "commercial"],
  hotel: ["hotel", "hospitality", "commercial"],
  oficina: ["office", "conference", "corporate"],
  auditorio: ["auditorium", "theater", "performance"],
  salon: ["ballroom", "hall", "auditorium"],
  salón: ["ballroom", "hall", "auditorium"],
  iglesia: ["church", "worship", "house of worship"],
  gimnasio: ["gym", "fitness", "sports"],
  comercio: ["retail", "commercial", "store"],
  local: ["retail", "commercial"],
  casa: ["residential", "home"],
  hogar: ["residential", "home"],
  sala: ["room", "zone"],
  salas: ["room", "zone"],
  zona: ["zone"],
  zonas: ["zone"],
  videoconferencia: ["video conferencing", "conferencing", "uc"],

  // Características
  proteccion: ["protection", "rating", "proteccion"],
  protección: ["protection", "rating"],
  resistencia: ["resistant", "rating"],
  montaje: ["mount", "mounting", "montaje"],
  entrada: ["input", "entrada"],
  entradas: ["input", "inputs"],
  salida: ["output", "salida"],
  salidas: ["output", "outputs"],
  canal: ["channel"],
  canales: ["channel", "channels"],
  resistente: ["resistant", "weather", "rugged"],
  agua: ["water", "weather", "waterproof"],
  potencia: ["power", "watt"],
  inalambrico: ["wireless"],
  inalámbrico: ["wireless"],
  red: ["network", "ethernet", "ip"],
  empotrado: ["in-ceiling", "in-wall", "flush"],
};

/**
 * Expande los términos de la pregunta con sus equivalentes en inglés.
 * Devuelve como mucho `max` términos: el retrieval tiene que seguir siendo barato.
 */
export function expandSearchTerms(tokens: string[], max = 10): string[] {
  const out: string[] = [];
  const push = (value: string) => {
    const clean = value.trim().toLowerCase();
    if (clean.length < 2) return;
    if (!out.includes(clean)) out.push(clean);
  };

  // Primero todos los términos originales, después las traducciones en
  // rondas. Así el recorte final nunca deja afuera un concepto entero:
  // "parlante de embutir en techo" conserva speaker, in-ceiling y ceiling.
  const keys = tokens.map((token) => token.toLowerCase());
  for (const key of keys) push(key);

  const depth = Math.max(0, ...keys.map((key) => (SYNONYMS[key] ?? []).length));
  for (let round = 0; round < depth; round++) {
    for (const key of keys) {
      const synonym = (SYNONYMS[key] ?? [])[round];
      if (synonym) push(synonym);
    }
  }
  return out.slice(0, max);
}

/** Términos en inglés asociados a un concepto de aplicación (exterior, hotel…). */
export function synonymsFor(term: string): string[] {
  return SYNONYMS[term.toLowerCase()] ?? [];
}
