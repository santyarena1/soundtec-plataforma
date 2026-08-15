import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";

const PROFILES = [
  {
    key: "resumido",
    name: "Resumido",
    description: "Carta corta: intro, tabla, condiciones, garantía.",
    sectionKeys: [
      "letter_open",
      "products_table",
      "commercial_terms",
      "warranty",
      "closing",
    ],
    isDefault: false,
  },
  {
    key: "tecnico",
    name: "Técnico estándar",
    description: "Propuesta + tabla + instalación + condiciones.",
    sectionKeys: [
      "letter_open",
      "corporate_intro",
      "proposal",
      "products_table",
      "installation",
      "commercial_terms",
      "warranty",
      "iso",
      "closing",
    ],
    isDefault: true,
  },
  {
    key: "premium",
    name: "Técnico premium",
    description: "Editorial: fichas, fotos, criterios, como COT detallada.",
    sectionKeys: [
      "letter_open",
      "corporate_intro",
      "brands",
      "proposal",
      "design_criteria",
      "key_products",
      "functionality",
      "products_table",
      "installation",
      "staff",
      "commercial_terms",
      "warranty",
      "iso",
      "closing",
    ],
    isDefault: false,
  },
] as const;

export async function ensureQuoteProfiles() {
  for (const p of PROFILES) {
    await prisma.quoteContentProfile.upsert({
      where: { key: p.key },
      update: {
        name: p.name,
        description: p.description,
        sectionKeys: p.sectionKeys,
        isDefault: p.isDefault,
      },
      create: {
        key: p.key,
        name: p.name,
        description: p.description,
        sectionKeys: p.sectionKeys,
        isDefault: p.isDefault,
      },
    });
  }
}

export async function resolveDefaultProfileId() {
  await ensureQuoteProfiles();
  const fromSetting = await getSetting(QUOTE_SETTING_KEYS.defaultProfile, "tecnico");
  const found = await prisma.quoteContentProfile.findUnique({ where: { key: fromSetting } });
  if (found) return found.id;
  const fallback = await prisma.quoteContentProfile.findFirst({ where: { isDefault: true } });
  return fallback?.id ?? null;
}

export const LETTER_OPEN_TEMPLATE = `De nuestra consideración:
De acuerdo a lo solicitado se extiende para su evaluación la presente cotización por la provisión de equipamiento y/o servicios para el sistema de la referencia.`;
