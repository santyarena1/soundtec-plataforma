import {
  AlignLeft,
  CalendarClock,
  CalendarDays,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Hash,
  Image as ImageIcon,
  ListChecks,
  Mail,
  MapPin,
  MessageSquareText,
  Phone,
  SlidersHorizontal,
  Tags,
  ThumbsUp,
  Type,
  Video,
} from "lucide-react";
import type { BlockType } from "@/lib/forms/types";
import type { NewFormBlock } from "@/server/actions/forms";
import type { EditableBlock } from "./block-editor";

export const ICONS: Record<BlockType, typeof Type> = {
  short_text: Type,
  long_text: AlignLeft,
  email: Mail,
  phone: Phone,
  number: Hash,
  date: CalendarDays,
  single_choice: CircleDot,
  multi_choice: ListChecks,
  dropdown: ChevronDown,
  yes_no: ThumbsUp,
  scale: SlidersHorizontal,
  consent: CheckSquare,
  brand_choice: Tags,
  statement: MessageSquareText,
  image: ImageIcon,
  video: Video,
  map: MapPin,
  agenda: CalendarClock,
};

/** Imagen, video y mapa ocupan la pantalla entera: no se les suman campos. */
const FULL_SCREEN: BlockType[] = ["image", "video", "map", "agenda"];

export type Screen = { id: string; blocks: EditableBlock[] };

/**
 * Pantallas a partir de la lista plana de bloques: cada bloque con
 * «groupWithPrevious» va en la misma pantalla que el anterior.
 */
export function toScreens(blocks: EditableBlock[]): Screen[] {
  const screens: Screen[] = [];
  for (const block of blocks) {
    const last = screens[screens.length - 1];
    if (block.config.groupWithPrevious && last) last.blocks.push(block);
    else screens.push({ id: block.id, blocks: [block] });
  }
  return screens;
}

export function acceptsFields(screen: Screen): boolean {
  return !FULL_SCREEN.includes(screen.blocks[0].type);
}

/** Orden plano y la marca de «misma pantalla» que corresponde a cada bloque según su posición. */
export function flatten(screens: EditableBlock[][]): { ids: string[]; grouped: Map<string, boolean> } {
  const ids: string[] = [];
  const grouped = new Map<string, boolean>();
  for (const screen of screens) {
    screen.forEach((block, i) => {
      ids.push(block.id);
      grouped.set(block.id, i > 0);
    });
  }
  return { ids, grouped };
}

/** Atajo: la pantalla de datos de contacto típica de un evento. */
export const CONTACT_PRESET: NewFormBlock[] = [
  { type: "statement", title: "Tus datos", config: {} },
  { type: "short_text", title: "Nombre y apellido", required: true, config: { groupWithPrevious: true, placeholder: "Nombre y apellido" } },
  { type: "short_text", title: "Cargo / rol", config: { groupWithPrevious: true, placeholder: "Integrador, arquitecto, dueño…" } },
  { type: "email", title: "Email", required: true, config: { groupWithPrevious: true } },
  { type: "phone", title: "Celular", required: true, config: { groupWithPrevious: true } },
  { type: "short_text", title: "Empresa", config: { groupWithPrevious: true, placeholder: "Nombre de la empresa" } },
];
