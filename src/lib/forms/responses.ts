import { prisma } from "@/lib/prisma";
import { answerToText, isQuestionType, readConfig, type BlockType } from "@/lib/forms/types";

export type ResponseColumn = { id: string; title: string; type: BlockType; removed: boolean };

export type FormResponsesData = {
  form: { id: string; title: string; token: string; status: string };
  columns: ResponseColumn[];
  rows: Array<{ id: string; submittedAt: Date; cells: Record<string, string> }>;
  /** Conteo por opción para opciones, sí/no y escala. */
  summaries: Array<{ column: ResponseColumn; total: number; counts: Array<{ label: string; count: number }> }>;
};

/**
 * Respuestas de un formulario listas para la tabla y el Excel: una columna por
 * pregunta actual (en su orden) y, al final, las preguntas que se quitaron pero
 * tienen respuestas guardadas.
 */
export async function loadFormResponses(formId: string): Promise<FormResponsesData | null> {
  const form = await prisma.form.findUnique({
    where: { id: formId },
    include: { blocks: { orderBy: { sortOrder: "asc" } }, responses: { orderBy: { submittedAt: "desc" } } },
  });
  if (!form) return null;

  const columns: ResponseColumn[] = form.blocks
    .filter((b) => isQuestionType(b.type))
    .map((b) => ({ id: b.id, title: b.title || "(sin título)", type: b.type as BlockType, removed: false }));
  const known = new Set(columns.map((c) => c.id));
  for (const r of form.responses) {
    for (const q of (r.snapshot as Array<{ id: string; type: string; title: string }>) ?? []) {
      if (known.has(q.id)) continue;
      known.add(q.id);
      columns.push({ id: q.id, title: q.title || "(sin título)", type: q.type as BlockType, removed: true });
    }
  }

  const rows = form.responses.map((r) => {
    const answers = (r.answers ?? {}) as Record<string, unknown>;
    return { id: r.id, submittedAt: r.submittedAt, cells: Object.fromEntries(columns.map((c) => [c.id, answerToText(answers[c.id])])) };
  });

  const summaries = columns
    .filter((c) => !c.removed && ["single_choice", "multi_choice", "dropdown", "yes_no", "scale", "brand_choice"].includes(c.type))
    .map((column) => {
      const block = form.blocks.find((b) => b.id === column.id)!;
      const config = readConfig(block.config);
      const base =
        column.type === "yes_no"
          ? ["Sí", "No"]
          : column.type === "scale"
            ? Array.from({ length: (config.max ?? 10) - (config.min ?? 1) + 1 }, (_, i) => String((config.min ?? 1) + i))
            : config.options ?? [];
      const counts = new Map(base.map((label) => [label, 0]));
      let total = 0;
      for (const r of form.responses) {
        const value = ((r.answers ?? {}) as Record<string, unknown>)[column.id];
        if (value == null || value === "") continue;
        total += 1;
        for (const v of Array.isArray(value) ? value : [value]) {
          const key = String(v).startsWith("Otra: ") ? "Otra" : String(v);
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      }
      return { column, total, counts: [...counts.entries()].map(([label, count]) => ({ label, count })) };
    });

  return { form: { id: form.id, title: form.title, token: form.token, status: form.status }, columns, rows, summaries };
}
