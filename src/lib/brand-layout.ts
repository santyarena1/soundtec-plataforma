/**
 * Grupos de marcas del catálogo: qué marcas van juntas y en qué orden. Se
 * guarda como JSON en AdminSetting «catalog.brand_layout» y se edita en
 * Admin › Marcas. La primera marca de cada grupo es la principal; las demás,
 * sus hermanas. Las marcas se nombran por nombre (los ids cambian entre bases).
 *
 * Con los grupos se arman solos:
 * - el menú de marcas (pantalla para elegir marca): grupos de 2 en caja
 *   compartida, de 3 o más en caja ancha, de 1 en caja suelta (de a 3 por fila);
 * - la barra arriba del listado: solo la principal de cada grupo, que despliega
 *   sus hermanas; «separadas» muestra cada marca del grupo por su cuenta.
 *
 * Este módulo no toca la base, así se prueba sin datos.
 */
import { z } from "zod";

export const BRAND_LAYOUT_SETTING_KEY = "catalog.brand_layout";

const brandName = z.string().trim().min(1).max(80);
const groupSchema = z.object({
  brands: z.array(brandName).min(1).max(12),
  /** En la barra, cada marca del grupo por su cuenta (Crestron y Crestron Home). */
  separate: z.boolean().optional(),
});
const groupsSchema = z.object({ groups: z.array(groupSchema).max(60) });
/** Formato anterior (filas de cajas): se sigue leyendo, cada caja pasa a ser un grupo. */
const legacyRowsSchema = z.object({ rows: z.array(z.array(z.object({ kind: z.string(), brands: z.array(brandName).min(1) }))) });

export type BrandGroupConfig = z.infer<typeof groupSchema>;
export type BrandGroupsConfig = z.infer<typeof groupsSchema>;

/** El boceto del dueño (pedidos 18 y 19). */
export const DEFAULT_BRAND_GROUPS: BrandGroupsConfig = {
  groups: [
    { brands: ["Crestron", "Crestron Home"], separate: true },
    { brands: ["SONANCE", "BLAZE BY SONANCE"] },
    { brands: ["SoundTube", "Phase Technology", "Rockustics", "SolidDrive", "Soundsphere", "dARTS", "Induction Dynamics"] },
    { brands: ["Atlona", "Hall Tech", "Javelin", "Gain Audio", "Captivate"] },
    { brands: ["JAMES"] },
    { brands: ["TRUFIG"] },
    { brands: ["IPORT"] },
    { brands: ["Bluesound Professional"] },
    { brands: ["BrightSign"] },
    { brands: ["Dante"] },
    { brands: ["FlatPanel Audio"] },
    { brands: ["Work Pro"] },
    { brands: ["Yamaha"] },
  ],
};

/** Lee el JSON guardado; si está vacío o roto, el boceto por defecto. */
export function parseBrandGroups(raw: string | null | undefined): BrandGroupsConfig {
  if (!raw?.trim()) return DEFAULT_BRAND_GROUPS;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return DEFAULT_BRAND_GROUPS;
  }
  const parsed = groupsSchema.safeParse(json);
  if (parsed.success && parsed.data.groups.length) return parsed.data;
  const legacy = legacyRowsSchema.safeParse(json);
  if (legacy.success && legacy.data.rows.length) {
    return { groups: legacy.data.rows.flat().map((box) => ({ brands: box.brands.slice(0, 12) })) };
  }
  return DEFAULT_BRAND_GROUPS;
}

/** Valida lo que manda el editor (error legible para el admin). */
export function validateBrandGroups(input: unknown): { ok: true; config: BrandGroupsConfig } | { ok: false; error: string } {
  const parsed = groupsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Revisá los grupos: cada uno necesita al menos una marca (y hasta 12)." };
  return { ok: true, config: parsed.data };
}

/** «BLAZE BY SONANCE», «blaze-by-sonance» y «Blaze by Sonance» son la misma marca. */
export function brandKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface LayoutBrand {
  id: string;
  name: string;
  slug?: string;
}

export type LayoutCell<B extends LayoutBrand> = { type: "brand"; brand: B } | { type: "soon"; name: string };

export interface ResolvedGroup<B extends LayoutBrand> {
  /** La primera es la principal. */
  cells: LayoutCell<B>[];
  separate: boolean;
}

export interface ResolvedBrandGroups<B extends LayoutBrand> {
  groups: ResolvedGroup<B>[];
  /** Marcas visibles que ningún grupo nombra: van al final, en «Más marcas». */
  extras: B[];
}

/**
 * Ubica las marcas que ve quien navega en los grupos:
 * - cada nombre se busca por nombre o slug;
 * - si no está pero la marca existe en la base (oculta, sin productos para este cliente), no se muestra;
 * - si no existe en la base, se muestra como «Próximamente» con su nombre;
 * - una marca aparece una sola vez; los grupos vacíos se caen; si falta la principal, la siguiente toma su lugar;
 * - lo que ningún grupo nombra va a «Más marcas», en el orden recibido.
 */
export function resolveBrandGroups<B extends LayoutBrand>(
  config: BrandGroupsConfig,
  brands: B[],
  knownBrandNames: Iterable<string>
): ResolvedBrandGroups<B> {
  const byKey = new Map<string, B>();
  for (const brand of brands) {
    for (const key of [brandKey(brand.name), brand.slug ? brandKey(brand.slug) : ""]) {
      if (key && !byKey.has(key)) byKey.set(key, brand);
    }
  }
  const known = new Set(Array.from(knownBrandNames, brandKey));
  const used = new Set<string>();
  const soonUsed = new Set<string>();

  const cellFor = (name: string): LayoutCell<B> | null => {
    const key = brandKey(name);
    if (!key) return null;
    const brand = byKey.get(key);
    if (brand) {
      if (used.has(brand.id)) return null;
      used.add(brand.id);
      return { type: "brand", brand };
    }
    if (known.has(key) || soonUsed.has(key)) return null;
    soonUsed.add(key);
    return { type: "soon", name: name.trim() };
  };

  const groups = config.groups
    .map((group): ResolvedGroup<B> => ({
      cells: group.brands.map(cellFor).filter((cell): cell is LayoutCell<B> => cell !== null),
      separate: group.separate ?? false,
    }))
    .filter((group) => group.cells.length > 0);

  return { groups, extras: brands.filter((brand) => !used.has(brand.id)) };
}

/* ───────────── Menú de marcas (pantalla para elegir marca) ───────────── */

/** «pair»: dos marcas en la misma caja · «group»: principal + hermanas a lo ancho · «single»: caja suelta. */
export type MenuBoxKind = "pair" | "group" | "single";
export interface MenuBox<B extends LayoutBrand> {
  kind: MenuBoxKind;
  cells: LayoutCell<B>[];
}

const PER_ROW: Record<MenuBoxKind, number> = { group: 1, pair: 2, single: 3 };

/** Arma las filas del menú en el orden de los grupos: de a 2 cajas compartidas, de a 3 sueltas, los grupos grandes solos. */
export function packMenuRows<B extends LayoutBrand>(groups: ResolvedGroup<B>[]): MenuBox<B>[][] {
  const rows: MenuBox<B>[][] = [];
  let current: MenuBox<B>[] = [];
  for (const group of groups) {
    const kind: MenuBoxKind = group.cells.length >= 3 ? "group" : group.cells.length === 2 ? "pair" : "single";
    if (current.length && (current[0].kind !== kind || current.length >= PER_ROW[kind])) {
      rows.push(current);
      current = [];
    }
    current.push({ kind, cells: group.cells });
  }
  if (current.length) rows.push(current);
  return rows;
}

/* ───────────── Barra de marcas (arriba del listado) ───────────── */

export type BarEntry<B extends LayoutBrand> =
  | { type: "brand"; brand: B }
  | { type: "soon"; name: string }
  /** Principal con hermanas: se despliega. `members` incluye a la principal primero. */
  | { type: "family"; lead: B; members: LayoutCell<B>[] };

/** Entradas de la barra: la principal de cada grupo (con sus hermanas para desplegar) y, al final, las que no están en ningún grupo. */
export function buildBarEntries<B extends LayoutBrand>(resolved: ResolvedBrandGroups<B>): BarEntry<B>[] {
  const entries: BarEntry<B>[] = [];
  for (const group of resolved.groups) {
    const [lead] = group.cells;
    if (group.separate || group.cells.length === 1 || lead.type !== "brand") {
      entries.push(...group.cells);
      continue;
    }
    entries.push({ type: "family", lead: lead.brand, members: group.cells });
  }
  entries.push(...resolved.extras.map((brand): BarEntry<B> => ({ type: "brand", brand })));
  return entries;
}
