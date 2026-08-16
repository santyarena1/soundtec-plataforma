import { HELP_MODULES } from "./modules";
import { TUTORIAL_DETAILED, TUTORIAL_SIMPLE } from "./tutorial";
import { TOURS } from "./tours";

function articleText(title: string, summary: string, blocks: { title: string; body: string[] }[]) {
  const parts = [`## ${title}`, summary];
  for (const block of blocks) {
    parts.push(`### ${block.title}`);
    parts.push(...block.body.map((line) => `- ${line}`));
  }
  return parts.join("\n");
}

export function buildHelpKnowledge(): string {
  const modules = HELP_MODULES.map((mod) =>
    [
      `# ${mod.title} (id: ${mod.id})`,
      `Para qué: ${mod.purpose}`,
      `En una frase: ${mod.simple}`,
      `Campos:`,
      ...mod.fields.map((field) => `- ${field}`),
      `Se edita: ${mod.editable}`,
      `No se edita: ${mod.notEditable}`,
      `Dónde se configura: ${mod.config}`,
      `Tips:`,
      ...mod.tips.map((tip) => `- ${tip}`),
    ].join("\n")
  );

  const simple = TUTORIAL_SIMPLE.map((article) => articleText(article.title, article.summary, article.blocks));
  const detailed = TUTORIAL_DETAILED.map((article) => articleText(article.title, article.summary, article.blocks));
  const tours = TOURS.map((tour) =>
    [
      `Recorrido: ${tour.title} (${tour.id})`,
      ...tour.steps.map(
        (step) =>
          `- [${step.target}] ${step.title}: ${step.body}${step.editable ? ` Se edita: ${step.editable}` : ""}`
      ),
    ].join("\n")
  );

  return [
    "Documentación interna de la plataforma Soundtec (admin).",
    "El cliente del portal NO ve el editor de cotizaciones: solo descarga PDF.",
    "Si algo parece un bug, pedí que creen un ticket al desarrollador desde este chat.",
    "",
    "===== MÓDULOS =====",
    ...modules,
    "",
    "===== TUTORIAL SIMPLE =====",
    ...simple,
    "",
    "===== TUTORIAL DETALLADO =====",
    ...detailed,
    "",
    "===== RECORRIDOS EN PANTALLA =====",
    ...tours,
  ].join("\n\n");
}
