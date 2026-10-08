/**
 * Guía comercial Soundtec (no es el Collab Room Builder de Crestron).
 * Acota plataforma y familia de audio según el tipo de espacio.
 */

export type AudioFamily = "sonance" | "blaze" | "bluesound";

export type PlatformAdvice = {
  platform: string;
  title: string;
  when: string;
  notFor: string;
};

export type AudioAdvice = {
  family: AudioFamily;
  label: string;
  fit: "recomendado" | "alternativa" | "no";
  why: string;
};

const PLATFORMS: Record<string, PlatformAdvice> = {
  "crestron-home": {
    platform: "crestron-home",
    title: "Crestron Home",
    when: "Habitación, suite, living o casa: un procesador Home controla TV, audio, luces y teclas. El huésped o el dueño usa touch/app, no una reunión de Teams.",
    notFor: "Salas de videoconferencia, aulas o cartelería. Ahí Home no reemplaza un códec Teams/Zoom.",
  },
  teams: {
    platform: "teams",
    title: "Microsoft Teams",
    when: "Sala de reuniones, boardroom o capacitación donde la gente entra a una reunión de Teams. Lleva códec/compute certificado, cámara, mic y display.",
    notFor: "Hotel guest o living. No hace falta (ni conviene) Crestron Home para una llamada.",
  },
  zoom: {
    platform: "zoom",
    title: "Zoom Rooms",
    when: "Igual que Teams, pero el cómputo y la cámara tienen que estar en la lista de Zoom Rooms.",
    notFor: "Audio ambiente de lobby o pileta, donde no hay reunión.",
  },
  byod: {
    platform: "byod",
    title: "BYOD",
    when: "Huddle chico: la notebook del usuario es la reunión (HDMI/USB o inalámbrico). Menos rack, más simple.",
    notFor: "Boardroom grande o hotel, donde hace falta un sistema fijo.",
  },
  none: {
    platform: "none",
    title: "Sin UC",
    when: "Lobby, signage, eventos, audio de zona o bar: hay imagen y/o sonido, no una plataforma de reuniones.",
    notFor: "No elijas esto si el cliente va a agendar reuniones de Teams o Zoom en la sala.",
  },
};

export function platformAdvice(platform: string): PlatformAdvice {
  return PLATFORMS[platform] ?? PLATFORMS.none!;
}

/** Qué plataforma conviene según la categoría del espacio. */
export function suggestPlatform(category: string): string {
  if (category === "videoconference" || category === "training") return "teams";
  if (category === "hotel" || category === "residential") return "crestron-home";
  if (category === "classroom") return "zoom";
  return "none";
}

export function audioAdvice(category: string, platform: string): AudioAdvice[] {
  const home =
    platform === "crestron-home" ||
    category === "hotel" ||
    category === "residential";
  const conferencing =
    platform === "teams" ||
    platform === "zoom" ||
    platform === "byod" ||
    category === "videoconference" ||
    category === "classroom" ||
    category === "training";
  const zones =
    category === "lobby" ||
    category === "event" ||
    category === "signage" ||
    category === "hotel";

  const sonance: AudioAdvice = {
    family: "sonance",
    label: "Sonance",
    fit: home ? "recomendado" : conferencing ? "alternativa" : "alternativa",
    why: home
      ? "Parlante arquitectónico (techo/pared) que desaparece en habitación, suite o living. Va con el DSP/amp de la línea cuando el brief es discreto, no un PA."
      : "Sirve si querés techo invisible en una sala, pero no es la primera opción para zonas grandes ni para música por app.",
  };
  const blaze: AudioAdvice = {
    family: "blaze",
    label: "Blaze",
    fit: zones && !home ? "recomendado" : conferencing ? "alternativa" : zones ? "alternativa" : "no",
    why:
      category === "event" || category === "lobby" || category === "signage"
        ? "Potencia y zonas (incluido línea de 70/100 V) para lobby, pasillo, salón o exterior. Conviene cuando hay que cubrir metros, no un living hi-fi."
        : "Útil como amp de zona o apoyo. En una habitación o un living chico suele sobrar frente a Sonance.",
  };
  const bluesound: AudioAdvice = {
    family: "bluesound",
    label: "Bluesound Professional",
    fit:
      category === "lobby" || category === "hotel" || category === "residential"
        ? "recomendado"
        : conferencing
          ? "no"
          : "alternativa",
    why: conferencing
      ? "Es streaming multi-zona (playlists, app). No reemplaza el DSP/mic de una sala de reuniones."
      : "Música de fondo por zonas con app: bar, lobby, amenities, living. Conviene cuando el pedido es contenido musical, no una llamada.",
  };

  if (home && category !== "event") {
    sonance.fit = "recomendado";
    bluesound.fit = category === "residential" || category === "hotel" ? "alternativa" : bluesound.fit;
    if (category === "hotel" && platform === "crestron-home") {
      // guest room: Sonance first; common areas still Bluesound/Blaze
      blaze.fit = "alternativa";
    }
  }

  return [sonance, blaze, bluesound];
}
