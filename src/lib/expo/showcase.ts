/**
 * Selección de productos para la vidriera de la pantalla del stand.
 * La marca Principal/Accesorio del catálogo no es confiable, así que además
 * se descartan nombres que delatan un accesorio, parte o kit de montaje.
 */

export interface ShowcaseCandidate {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  /** Mayor = más relevante dentro de su marca. */
  score: number;
}

const ACCESSORY_PATTERN =
  /\b(grille|grill|bracket|trim|kit|mount(ing)?|template|cable|plate|backplate|shim|bushing|spacer|ring|fascia|frame|stake|harness|pouch|feet|ears|enclosure|replacement|adapter|module|card|cover|gyp|gypsum|drywall|mp|terminal|apparel|t-shirt|tshirt|shirt|tee|hoodie|sweatshirt|beanie|hat|mug|sticker|polo|jacket|backpack|snapback|cap|w?vneck|crewneck)\b/i;

export function isAccessoryLike(name: string): boolean {
  return ACCESSORY_PATTERN.test(name);
}

/** Los `perBrand` más relevantes de cada marca, intercalando marcas, hasta `limit`. */
export function pickShowcase(
  items: ShowcaseCandidate[],
  options: { perBrand: number; limit: number }
): ShowcaseCandidate[] {
  const byBrand = new Map<string, ShowcaseCandidate[]>();
  for (const item of items) {
    if (!item.imageUrl || isAccessoryLike(item.name)) continue;
    const list = byBrand.get(item.brand) ?? [];
    list.push(item);
    byBrand.set(item.brand, list);
  }
  const queues = [...byBrand.values()]
    .map((list) => list.sort((a, b) => b.score - a.score).slice(0, options.perBrand))
    .sort((a, b) => b[0].score - a[0].score);

  const out: ShowcaseCandidate[] = [];
  for (let round = 0; round < options.perBrand && out.length < options.limit; round++) {
    for (const queue of queues) {
      if (queue[round] && out.length < options.limit) out.push(queue[round]);
    }
  }
  return out;
}
