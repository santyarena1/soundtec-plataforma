import { z } from "zod";

/**
 * Cuerpo de una campaña: una lista de bloques simples que se apilan de arriba
 * hacia abajo. Se guardan en MailCampaign.blocks (JSON) y los arma la
 * plantilla (lib/mailing/template). Los productos guardan una copia de lo que
 * se ve (foto, modelo, marca, enlace) del momento en que se eligieron: el mail
 * no cambia solo si después se edita la ficha.
 */

const text = (max: number) => z.string().max(max).default("");
const url = z.string().trim().max(2000).default("");

export const productItemSchema = z.object({
  productId: z.string().max(60),
  title: text(200),
  subtitle: text(300),
  brand: text(120),
  imageUrl: url,
  url: url,
  /** Precio a mostrar, escrito a mano («USD 1.290 + IVA»). Vacío = sin precio. */
  priceText: text(80),
  /** Etiqueta chica arriba de la foto («Oferta», «Liquidación», «Nuevo»). */
  badge: text(40),
});

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: z.string().max(40), type: z.literal("heading"), text: text(300), size: z.enum(["xl", "lg"]).default("xl") }),
  z.object({ id: z.string().max(40), type: z.literal("text"), text: text(6000) }),
  z.object({ id: z.string().max(40), type: z.literal("image"), url, alt: text(200), href: url }),
  z.object({ id: z.string().max(40), type: z.literal("button"), label: text(80), href: url }),
  z.object({
    id: z.string().max(40),
    type: z.literal("products"),
    title: text(200),
    items: z.array(productItemSchema).max(12).default([]),
    /** Botón de cada producto («Ver ficha»). */
    cta: text(40),
  }),
  z.object({ id: z.string().max(40), type: z.literal("divider") }),
]);

export type MailBlock = z.infer<typeof blockSchema>;
export type MailBlockType = MailBlock["type"];
export type ProductItem = z.infer<typeof productItemSchema>;

export const blocksSchema = z.array(blockSchema).max(60);

/** Lee lo guardado en la base; lo que no se entiende se descarta (nunca rompe la pantalla). */
export function readBlocks(raw: unknown): MailBlock[] {
  if (!Array.isArray(raw)) return [];
  const out: MailBlock[] = [];
  for (const item of raw) {
    const parsed = blockSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}

export function newBlockId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function newBlock(type: MailBlockType): MailBlock {
  const id = newBlockId();
  switch (type) {
    case "heading":
      return { id, type, text: "Título de la promo", size: "xl" };
    case "text":
      return { id, type, text: "Hola {{nombre}},\n\nEscribí acá el mensaje." };
    case "image":
      return { id, type, url: "", alt: "", href: "" };
    case "button":
      return { id, type, label: "Ver más", href: "" };
    case "products":
      return { id, type, title: "", items: [], cta: "Ver ficha" };
    case "divider":
      return { id, type };
  }
}

/** Cuerpo inicial de una campaña nueva. */
export function starterBlocks(): MailBlock[] {
  return [
    { id: newBlockId(), type: "heading", text: "Novedades de esta semana", size: "xl" },
    {
      id: newBlockId(),
      type: "text",
      text: "Hola {{nombre}},\n\nTe compartimos los equipos que ingresaron y las condiciones de este mes. Cualquier consulta, respondé este mail o escribile a tu ejecutivo de cuenta.",
    },
    { id: newBlockId(), type: "products", title: "", items: [], cta: "Ver ficha" },
    { id: newBlockId(), type: "button", label: "Ver el catálogo completo", href: "https://www.soundtecportal.com.ar/catalogo" },
  ];
}

export const BLOCK_LABELS: Record<MailBlockType, string> = {
  heading: "Título",
  text: "Texto",
  image: "Imagen",
  button: "Botón",
  products: "Productos",
  divider: "Separador",
};
