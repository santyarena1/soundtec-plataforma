/** Marcas del grupo Hall Research (Atlona y familia), compartidas por la lista de precios y el enriquecimiento web. */
export const HALL_RESEARCH_BRANDS = ["Atlona", "Javelin", "Hall Tech", "Gain Audio", "Captivate"] as const;

export type HallResearchBrand = (typeof HALL_RESEARCH_BRANDS)[number];
