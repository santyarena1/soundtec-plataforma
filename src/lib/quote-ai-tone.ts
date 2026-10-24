/**
 * Registro de los textos de cotización: ingeniero comercial rioplatense,
 * frases cortas, concreto. Lista negra de muletillas de IA y un ejemplo del
 * tono buscado, para el prompt y para el post-chequeo.
 */

export const GENERIC_PHRASES: readonly string[] = [
  "garantizando una experiencia",
  "garantizar una experiencia",
  "experiencia inmersiva",
  "experiencia fluida",
  "experiencia excepcional",
  "experiencia de usuario superior",
  "alta gama",
  "solución integral",
  "soluciones integrales",
  "desde el primer día",
  "maximizando la productividad",
  "maximizar la productividad",
  "robusto",
  "robusta",
  "de vanguardia",
  "última generación",
  "ultima generacion",
  "tecnología de punta",
  "calidad superior",
  "sin precedentes",
  "a otro nivel",
  "llevar al siguiente nivel",
  "innovador",
  "innovadora",
  "revolucionario",
  "cutting-edge",
  "state of the art",
  "sinergia",
  "en el mundo actual",
  "hoy en día",
  "no solo",
  "potenciar",
  "potenciando",
  "elevar la experiencia",
  "perfecta integración",
  "integración perfecta",
  "a la medida de sus necesidades",
  "garantizando",
  "asegurando",
  "optimiza la experiencia",
  "experiencia de uso",
  "mejora la eficiencia",
];

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Frases de la lista negra que aparecen en el texto (sin HTML, sin acentos). */
export function findGenericPhrases(text: string): string[] {
  const plain = ` ${fold(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ")} `;
  const found: string[] = [];
  for (const phrase of GENERIC_PHRASES) {
    const p = fold(phrase);
    const re = new RegExp(`(^|[^a-z0-9])${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`);
    if (re.test(plain) && !found.includes(phrase)) found.push(phrase);
  }
  return found;
}

export const TONE_RULES = `REGISTRO: ingeniero comercial de un integrador audiovisual porteño. Frases cortas. Cada oración dice algo verificable (qué equipo, dónde, para qué). Voseo formal o impersonal, nunca tuteo.
PROHIBIDAS estas frases y sus variantes: ${GENERIC_PHRASES.map((p) => `«${p}»`).join(", ")}.
Nada de adjetivos de folleto. Si no hay un dato, no lo rellenes: omitilo.

EJEMPLO DEL REGISTRO (no copies el contenido, solo el tono):
«La sala se resuelve con una barra de videoconferencia sobre la pantalla y un panel táctil en la mesa. Desde el panel se inicia la reunión de Teams y se elige la fuente HDMI. El audio del techo cubre las 12 posiciones sin que nadie tenga que acercarse al micrófono.»`;
