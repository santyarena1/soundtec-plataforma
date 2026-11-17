import {
  Blinds,
  Box,
  Cable,
  CircuitBoard,
  Construction,
  Folder,
  Frame,
  Handshake,
  Layers,
  Lightbulb,
  MessagesSquare,
  Monitor,
  MonitorSmartphone,
  Network,
  Package,
  Puzzle,
  Server,
  Shapes,
  SlidersHorizontal,
  Sparkles,
  Speaker,
  Video,
  Wrench,
  type LucideIcon,
} from "lucide-react";

/** Ícono lineal por rubro principal (por palabra clave del nombre); si no hay, una carpeta. */
const RULES: Array<[RegExp, LucideIcon]> = [
  [/sonido|audio|amplif|parlante|bafle/, Speaker],
  [/control|automatiz/, SlidersHorizontal],
  [/telepresencia|videoconf|camara/, Video],
  [/pantallas? tactil|touch|usuario/, MonitorSmartphone],
  [/video|monitor|display|proyec/, Monitor],
  [/soporte|montaje/, Frame],
  [/conectividad|red|network/, Network],
  [/cable|alambre/, Cable],
  [/rack|case/, Server],
  [/material/, Layers],
  [/herramienta/, Wrench],
  [/insumo/, Package],
  [/servicio/, Handshake],
  [/ilumina|luz/, Lightbulb],
  [/accesorio|repuesto/, Puzzle],
  [/efecto/, Sparkles],
  [/estructura/, Construction],
  [/comunicacion/, MessagesSquare],
  [/componente|electronic/, CircuitBoard],
  [/sombreado|cortina|persiana/, Blinds],
  [/varios/, Shapes],
  [/articulo/, Box],
];

export function categoryIconFor(name: string): LucideIcon {
  const key = name.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
  return RULES.find(([pattern]) => pattern.test(key))?.[1] ?? Folder;
}
