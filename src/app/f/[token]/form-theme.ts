import type { FormSettings } from "@/lib/forms/types";

export type FormTheme = {
  dark: boolean;
  page: string;
  glow: string;
  muted: string;
  input: string;
  choice: string;
  choiceOn: string;
  key: string;
  button: string;
  prose: string;
  /** Barra de progreso, asterisco de obligatorio y círculo final. */
  bar: string;
  mark: string;
  /** Casillas de logos de marcas: siempre fondo blanco para que el logo se lea. */
  tileOn: string;
};

const DARK: FormTheme = {
  dark: true,
  page: "bg-[#13233a] text-white",
  glow: "from-[#2f5f9e]/45 via-transparent to-transparent",
  muted: "text-white/70",
  input: "border-white/40 text-white placeholder:text-white/35 focus:border-white",
  choice: "border-white/25 bg-white/5 hover:bg-white/10",
  choiceOn: "border-white bg-white/20",
  key: "border-white/40 text-white/80",
  button: "bg-white text-[#13233a] hover:bg-white/90",
  prose: "prose-invert",
  bar: "bg-[#2f6fd6]",
  mark: "text-[#7fb0ff]",
  tileOn: "ring-4 ring-[#7fb0ff]",
};

/** Colores de acción y texto según el acento: azul Soundtec o negro. */
const BLUE = {
  ink: "text-[#13233a]",
  muted: "text-[#13233a]/65",
  input: "border-[#13233a]/30 text-[#13233a] placeholder:text-[#13233a]/30 focus:border-[#1e3553]",
  choiceOn: "border-[#1e3553] bg-[#1e3553]/10",
  key: "border-[#1e3553]/35 text-[#1e3553]",
  button: "bg-[#1e3553] text-white hover:bg-[#16283f]",
  bar: "bg-[#2f6fd6]",
  mark: "text-[#2f6fd6]",
  tileOn: "ring-4 ring-[#1e3553]",
};

const BLACK = {
  ink: "text-neutral-950",
  muted: "text-neutral-950/60",
  input: "border-neutral-950/25 text-neutral-950 placeholder:text-neutral-950/30 focus:border-neutral-950",
  choiceOn: "border-neutral-950 bg-neutral-950/[0.06]",
  key: "border-neutral-950/35 text-neutral-950",
  button: "bg-neutral-950 text-white hover:bg-neutral-800",
  bar: "bg-neutral-950",
  mark: "text-neutral-950",
  tileOn: "ring-4 ring-neutral-950",
};

/** Combina el fondo elegido (blanco, claro con degradé, gris u oscuro) con el acento. */
export function formTheme(settings: Pick<FormSettings, "theme" | "accent">): FormTheme {
  if (settings.theme === "dark") return DARK;
  const a = settings.accent === "black" ? BLACK : BLUE;
  const background =
    settings.theme === "gray"
      ? { page: `bg-[#f1f2f4] ${a.ink}`, glow: "from-transparent to-transparent", choice: "border-black/10 bg-white hover:bg-white/70" }
      : settings.theme === "white"
        ? { page: `bg-white ${a.ink}`, glow: "from-transparent to-transparent", choice: "border-black/15 bg-white hover:bg-black/[0.03]" }
        : { page: `bg-white ${a.ink}`, glow: "from-[#dbe7f7] via-transparent to-transparent", choice: "border-[#1e3553]/20 bg-[#1e3553]/[0.03] hover:bg-[#1e3553]/[0.08]" };
  return {
    dark: false,
    ...background,
    muted: a.muted,
    input: a.input,
    choiceOn: a.choiceOn,
    key: a.key,
    button: a.button,
    prose: "",
    bar: a.bar,
    mark: a.mark,
    tileOn: a.tileOn,
  };
}
