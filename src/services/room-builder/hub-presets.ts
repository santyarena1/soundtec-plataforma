import type { RoomCategory } from "./types";

export type HubSpaceSpec = {
  templateKey: string;
  name: string;
  unitCount: number;
};

export type HubPreset = {
  key: string;
  name: string;
  category: RoomCategory;
  description: string;
  spaces: HubSpaceSpec[];
};

/** Proyectos multi-espacio prediseñados (día 1). */
export const HUB_PRESETS: HubPreset[] = [
  {
    key: "hotel-full",
    name: "Proyecto Hotel",
    category: "hotel",
    description:
      "Hub hotelero: lobby, habitaciones, suites, bar pileta y espacio común.",
    spaces: [
      { templateKey: "lobby-m", name: "Lobby", unitCount: 1 },
      { templateKey: "hotel-guest-s", name: "Habitación estándar", unitCount: 40 },
      { templateKey: "hotel-suite-m", name: "Suite", unitCount: 4 },
      { templateKey: "hotel-pool-bar-m", name: "Bar de pileta", unitCount: 1 },
      { templateKey: "hotel-common-m", name: "Espacio común / parque", unitCount: 1 },
      { templateKey: "event-banquet-l", name: "Salón de eventos", unitCount: 1 },
    ],
  },
  {
    key: "corporate-campus",
    name: "Campus corporativo",
    category: "videoconference",
    description: "Huddle, reuniones, boardroom, training y lobby.",
    spaces: [
      { templateKey: "lobby-m", name: "Lobby", unitCount: 1 },
      { templateKey: "vc-huddle-s", name: "Huddle", unitCount: 6 },
      { templateKey: "vc-meeting-m", name: "Sala de reuniones", unitCount: 4 },
      { templateKey: "vc-boardroom-l", name: "Boardroom", unitCount: 1 },
      { templateKey: "training-l", name: "Capacitación", unitCount: 1 },
    ],
  },
  {
    key: "school-campus",
    name: "Campus educativo",
    category: "classroom",
    description: "Aulas, capacitación y lobby.",
    spaces: [
      { templateKey: "lobby-m", name: "Recepción", unitCount: 1 },
      { templateKey: "classroom-m", name: "Aula", unitCount: 8 },
      { templateKey: "training-l", name: "Auditorio chico / training", unitCount: 1 },
    ],
  },
];

export function getHubPreset(key: string): HubPreset | undefined {
  return HUB_PRESETS.find((h) => h.key === key);
}

export function listHubPresets(): HubPreset[] {
  return HUB_PRESETS;
}
