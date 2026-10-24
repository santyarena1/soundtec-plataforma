/**
 * Arma lo que la IA lee de una cotización: el pedido del cliente, las notas
 * del comercial, el relevamiento (m², personas, presupuesto, marcas), la
 * clasificación interna, la lectura de planos y, al final y como referencia,
 * lo que se usó en cotizaciones parecidas. Puro y testeable.
 *
 * Orden de autoridad: pedido + notas humanas mandan; lo histórico orienta.
 */

export type QuoteIntake = {
  notes: string;
  areaM2: string;
  people: string;
  budgetUsd: string;
  brandPref: string;
  brandAvoid: string;
};

function str(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

/** Lee `advancedIntake` (JSON libre) sin confiar en su forma. */
export function readQuoteIntake(raw: unknown): QuoteIntake {
  const o = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    notes: str(o.notes).slice(0, 4000),
    areaM2: str(o.areaM2).slice(0, 40),
    people: str(o.people).slice(0, 40),
    budgetUsd: str(o.budgetUsd).slice(0, 40),
    brandPref: str(o.brandPref).slice(0, 200),
    brandAvoid: str(o.brandAvoid).slice(0, 200),
  };
}

function meaningful(text: string): number {
  return text.replace(/[^\p{L}\p{N}]/gu, "").length;
}

/**
 * ¿Hay un pedido real para redactar? Cuenta el brief, las notas humanas y los
 * datos del relevamiento. NO cuentan la clasificación ni los patrones: solos
 * no dicen qué necesita el cliente.
 */
export function hasRealBrief(input: { brief?: string | null; notes?: string | null; intake: QuoteIntake }): boolean {
  if (meaningful(input.brief ?? "") >= 12) return true;
  if (meaningful(input.notes ?? "") >= 12) return true;
  if (meaningful(input.intake.notes) >= 12) return true;
  const { areaM2, people, budgetUsd, brandPref } = input.intake;
  return [areaM2, people, budgetUsd, brandPref].some((v) => meaningful(v) > 0);
}

export const EMPTY_BRIEF_ERROR =
  "Escribí el brief del proyecto (qué necesita el cliente, dónde y para cuántas personas) antes de generar. El tipo de proyecto y las cotizaciones parecidas no alcanzan solos.";

/** Marcas a excluir: «No ofrecer: Bose, JBL» → ["bose", "jbl"]. */
export function avoidedBrands(intake: QuoteIntake): string[] {
  return intake.brandAvoid
    .split(/[,;/\n]+|\s+y\s+/i)
    .map((b) => b.trim().toLowerCase())
    .filter((b) => b.length >= 2);
}

export type BriefBlocksInput = {
  brief?: string | null;
  /** Notas cargadas al crear la COT (QuoteContext.notes). */
  contextNotes?: string | null;
  intake: QuoteIntake;
  projectType?: string | null;
  classification?: string | null;
  planNotes: string[];
  /** Cotizaciones parecidas / equipos del patrón. Solo referencia. */
  patternBlock?: string | null;
};

/** Texto con bloques etiquetados para el prompt. */
export function buildBriefBlocks(input: BriefBlocksInput): string {
  const blocks: string[] = [];
  const brief = (input.brief ?? "").trim();
  if (brief) blocks.push(`[PEDIDO DEL CLIENTE — manda]\n${brief}`);

  const notes = [input.contextNotes, input.intake.notes]
    .map((n) => (n ?? "").trim())
    .filter(Boolean)
    .filter((n, i, all) => all.indexOf(n) === i);
  if (notes.length) blocks.push(`[NOTAS DEL COMERCIAL — mandan sobre todo lo demás]\n${notes.join("\n")}`);

  const facts: string[] = [];
  if (input.intake.areaM2) facts.push(`Superficie: ${input.intake.areaM2} m²`);
  if (input.intake.people) facts.push(`Personas: ${input.intake.people}`);
  if (input.intake.budgetUsd) facts.push(`Presupuesto orientativo: USD ${input.intake.budgetUsd} (no lo menciones en los textos)`);
  if (input.intake.brandPref) facts.push(`Marcas preferidas: ${input.intake.brandPref}`);
  if (input.intake.brandAvoid) facts.push(`No ofrecer: ${input.intake.brandAvoid}`);
  if (facts.length) blocks.push(`[RELEVAMIENTO]\n${facts.join("\n")}`);

  const kind = [input.projectType, input.classification].map((v) => (v ?? "").trim()).filter(Boolean);
  if (kind.length) blocks.push(`[TIPO DE PROYECTO]\n${kind.join(" · ")}`);

  if (input.planNotes.length) blocks.push(`[LECTURA DE PLANOS — lo que se ve; sin medidas inventadas]\n${input.planNotes.join("\n\n")}`);

  const pattern = (input.patternBlock ?? "").trim();
  if (pattern) {
    blocks.push(
      `[REFERENCIA INTERNA — solo orientativa; si contradice el pedido o las notas, gana el pedido]\n${pattern}`
    );
  }
  return blocks.join("\n\n");
}

/**
 * Notas humanas de QuoteContext.notes, sin las líneas que escribe el sistema
 * («Generada desde el pedido…», y las sugerencias históricas que versiones
 * anteriores guardaban acá por error).
 */
export function humanContextNotes(notes: string | null | undefined): string {
  return (notes ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^(generada desde el pedido|suele ir junto|hist[oó]rico:)/i.test(line))
    .join("\n");
}
