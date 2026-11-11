import { prisma } from "@/lib/prisma";
import { isBlockType, readConfig, readSettings, type FormSettings, type PublicBlock } from "@/lib/forms/types";
import { sanitizeFormHtml } from "@/lib/forms/sanitize";
import { listVisibleCatalogBrands } from "@/lib/catalog";
import { resolveMapsLink } from "@/lib/forms/maps-resolve";

export type FormBrandOption = { id: string; name: string; logoUrl: string | null };

/** Marcas del catálogo público (con logo), para los bloques «Marcas». */
export async function listFormBrands(): Promise<FormBrandOption[]> {
  const { brands } = await listVisibleCatalogBrands({ commercialClientId: null, userId: null, isAdmin: false, publicMode: true });
  return brands.map((b) => ({ id: b.id, name: b.name, logoUrl: b.logoUrl }));
}

export type PublicForm = {
  id: string;
  title: string;
  token: string;
  settings: FormSettings;
  blocks: PublicBlock[];
  /** Abierto para responder ahora (estado OPEN y sin vencer). */
  open: boolean;
  closedReason: string | null;
};

/** Formulario por su enlace secreto, con los textos ya saneados. Null si el enlace no existe. */
export async function loadPublicForm(token: string, options?: { preview?: boolean }): Promise<PublicForm | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const form = await prisma.form.findUnique({
    where: { token },
    include: { blocks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) return null;
  const expired = form.closesAt != null && form.closesAt.getTime() < Date.now();
  const open = options?.preview ? true : form.status === "OPEN" && !expired;
  const closedReason = open
    ? null
    : form.status === "DRAFT"
      ? "Este formulario todavía no está abierto."
      : "Este formulario ya no recibe respuestas.";
  const settings = readSettings(form.settings);
  // Bloques «Marcas»: las opciones salen del catálogo (las elegidas en el editor, o todas).
  const brands = form.blocks.some((b) => b.type === "brand_choice") ? await listFormBrands() : [];
  const blocks = await Promise.all(
    form.blocks
      .filter((b) => isBlockType(b.type))
      .map(async (b) => ({
        id: b.id,
        type: b.type as PublicBlock["type"],
        title: b.title,
        body: sanitizeFormHtml(b.body),
        required: b.required,
        config: await withResolvedMap(withBrandOptions(b.type, readConfig(b.config), brands)),
      }))
  );
  const endMapResolved = settings.endMapResolved || (await resolveMapsLink(settings.endMapQuery));
  return {
    id: form.id,
    title: form.title,
    token: form.token,
    settings: {
      ...settings,
      welcomeBody: sanitizeFormHtml(settings.welcomeBody),
      endBody: sanitizeFormHtml(settings.endBody),
      endMapResolved,
    },
    blocks,
    open,
    closedReason,
  };
}

function withBrandOptions(type: string, config: PublicBlock["config"], brands: FormBrandOption[]): PublicBlock["config"] {
  if (type !== "brand_choice") return config;
  const chosen = config.brandIds?.length ? brands.filter((b) => config.brandIds!.includes(b.id)) : brands;
  return {
    ...config,
    options: chosen.map((b) => b.name),
    brandLogos: Object.fromEntries(chosen.filter((b) => b.logoUrl).map((b) => [b.name, b.logoUrl as string])),
  };
}

/** Mapas guardados como enlace corto antes de resolverlos al guardar: se resuelven al mostrar. */
async function withResolvedMap(config: PublicBlock["config"]): Promise<PublicBlock["config"]> {
  if (config.mapResolved || !config.mapQuery) return config;
  const resolved = await resolveMapsLink(config.mapQuery);
  return resolved ? { ...config, mapResolved: resolved } : config;
}
