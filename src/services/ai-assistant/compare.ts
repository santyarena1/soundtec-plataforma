/**
 * Sugerencia «Comparar A y B».
 *
 * La sugerencia viaja como texto (el botón manda la frase como si la hubiera
 * escrito la persona). Antes ese texto se volvía a buscar como si fuera una
 * pregunta nueva, y un modelo con barra ("PUNKROCK-S/T") se partía en dos
 * códigos que no existen: "No encontré información sobre PUNKROCK-S/T" justo
 * después de recomendarlo.
 *
 * Ahora la frase se arma y se lee con la misma función, y se resuelve contra
 * los productos que el asistente acaba de mostrar (sus ids quedan en la
 * sesión). Si no coincide exacto, se busca por nombre completo; nunca se
 * reinterpreta el modelo.
 */

export interface NamedProduct {
  id: string;
  name: string;
}

/** Nombre corto que entra en el botón: las tres primeras palabras. */
export function shortProductName(name: string): string {
  return name.trim().split(/\s+/).slice(0, 3).join(" ");
}

export function compareSuggestion(a: NamedProduct, b: NamedProduct): string {
  return `Comparar ${shortProductName(a.name)} y ${shortProductName(b.name)}`;
}

function norm(value: string): string {
  return value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Las dos mitades de "Comparar A y B". Como los nombres pueden tener " y "
 * adentro, se devuelven todos los cortes posibles; el que resuelve gana.
 */
export function parseCompareRequest(question: string): Array<[string, string]> {
  const match = /^\s*comparar\s+(.+?)\s*$/i.exec(question);
  if (!match) return [];
  const body = match[1];
  const out: Array<[string, string]> = [];
  const re = /\s+y\s+/gi;
  let hit: RegExpExecArray | null;
  while ((hit = re.exec(body))) {
    const left = body.slice(0, hit.index).trim();
    const right = body.slice(hit.index + hit[0].length).trim();
    if (left && right) out.push([left, right]);
  }
  return out;
}

/**
 * Busca el par entre productos conocidos (los últimos que mostró el
 * asistente). Devuelve los ids en el orden de la frase, o null.
 */
export function matchComparePair(question: string, known: NamedProduct[]): [string, string] | null {
  const splits = parseCompareRequest(question);
  if (splits.length === 0 || known.length < 2) return null;
  const find = (label: string, exclude?: string) => {
    const wanted = norm(label);
    return (
      known.find((product) => product.id !== exclude && norm(product.name) === wanted) ??
      known.find((product) => product.id !== exclude && norm(shortProductName(product.name)) === wanted) ??
      null
    );
  };
  for (const [left, right] of splits) {
    const a = find(left);
    if (!a) continue;
    const b = find(right, a.id);
    if (b) return [a.id, b.id];
  }
  return null;
}
