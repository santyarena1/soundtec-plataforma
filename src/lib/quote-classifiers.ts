import { prisma } from "@/lib/prisma";

export type ClassifierOptionDTO = {
  id: string;
  label: string;
  sortOrder: number;
};

export type ClassifierDTO = {
  id: string;
  label: string;
  hint: string | null;
  sortOrder: number;
  options: ClassifierOptionDTO[];
};

const DEFAULTS: Array<{ label: string; hint: string; options: string[] }> = [
  {
    label: "Tipo de sala",
    hint: "Qué se está cotizando. Lo usamos para buscar COT parecidas.",
    options: [
      "Sala de videoconferencia",
      "Aula híbrida",
      "Sala de reunión",
      "Auditorio",
      "Audio comercial / retail",
      "Outdoor",
      "Otro",
    ],
  },
  {
    label: "Escala",
    hint: "Tamaño relativo. Una grande reutiliza la mediana y suma lo que falte.",
    options: ["Chica", "Mediana", "Grande"],
  },
];

export async function ensureQuoteClassifiers() {
  const count = await prisma.quoteClassifier.count();
  if (count > 0) return;
  for (const [index, item] of DEFAULTS.entries()) {
    await prisma.quoteClassifier.create({
      data: {
        label: item.label,
        hint: item.hint,
        sortOrder: index,
        options: {
          create: item.options.map((label, optionIndex) => ({
            label,
            sortOrder: optionIndex,
          })),
        },
      },
    });
  }
}

export async function listQuoteClassifiers(): Promise<ClassifierDTO[]> {
  await ensureQuoteClassifiers();
  const rows = await prisma.quoteClassifier.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    include: {
      options: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
    },
  });
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    hint: row.hint,
    sortOrder: row.sortOrder,
    options: row.options.map((option) => ({
      id: option.id,
      label: option.label,
      sortOrder: option.sortOrder,
    })),
  }));
}

export function foldText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export function inferClassifierPicks(text: string, classifiers: ClassifierDTO[]) {
  const hay = foldText(text);
  const picks: Record<string, string> = {};
  if (!hay.trim()) return picks;
  for (const classifier of classifiers) {
    const ranked = [...classifier.options]
      .map((option) => ({ option, key: foldText(option.label) }))
      .filter((row) => row.key.length >= 3 && hay.includes(row.key))
      .sort((a, b) => b.key.length - a.key.length);
    if (ranked[0]) picks[classifier.id] = ranked[0].option.id;
  }
  return picks;
}

export function formatClassifierSummary(
  classifiers: ClassifierDTO[],
  picks: Record<string, string>
) {
  return classifiers
    .map((classifier) => {
      const option = classifier.options.find((item) => item.id === picks[classifier.id]);
      return option ? `${classifier.label}: ${option.label}` : null;
    })
    .filter(Boolean)
    .join(" · ");
}
