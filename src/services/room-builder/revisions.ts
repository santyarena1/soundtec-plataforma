/**
 * Revisiones de las láminas de un proyecto o ambiente: cada emisión lleva
 * letra correlativa (A, B, C… Z, AA…), fecha, autor, descripción y estado
 * de emisión. La última es la vigente: va en la cartela de todas las láminas
 * y la tabla completa en la primera. Lógica pura, sin base (se guarda como
 * JSON en RoomProject.revisionsJson).
 */

export type RevisionStatus = "preliminar" | "aprobacion" | "aprobado" | "obra" | "conforme";

/** Estados de emisión, en el orden en que avanza un proyecto. */
export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  preliminar: "Preliminar",
  aprobacion: "Para aprobación",
  aprobado: "Aprobado",
  obra: "Para obra",
  conforme: "Conforme a obra",
};

export const REVISION_STATUSES = Object.keys(REVISION_STATUS_LABEL) as RevisionStatus[];

export type Revision = {
  code: string;
  /** ISO 8601. */
  date: string;
  author: string;
  description: string;
  status: RevisionStatus;
};

/** Lo que muestra la cartela cuando todavía no se emitió ninguna revisión. */
export const DRAFT_REVISION = { code: "—", statusLabel: "Borrador sin emitir" } as const;

export const MAX_REVISIONS = 52;

/** Letra que sigue a una revisión: A → B, Z → AA, AZ → BA. */
export function nextRevisionCode(prev: string | null | undefined): string {
  if (!prev || !/^[A-Z]+$/.test(prev)) return "A";
  const chars = prev.split("");
  let i = chars.length - 1;
  while (i >= 0) {
    if (chars[i] !== "Z") {
      chars[i] = String.fromCharCode(chars[i]!.charCodeAt(0) + 1);
      return chars.join("");
    }
    chars[i] = "A";
    i--;
  }
  return `A${chars.join("")}`;
}

const isStatus = (v: unknown): v is RevisionStatus => typeof v === "string" && v in REVISION_STATUS_LABEL;

/** Lee el JSON guardado descartando lo que no tenga forma de revisión (nunca tira). */
export function parseRevisions(raw: unknown): Revision[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((r): r is Record<string, unknown> => Boolean(r) && typeof r === "object")
    .filter((r) => typeof r.code === "string" && typeof r.date === "string" && isStatus(r.status))
    .map((r) => ({ code: String(r.code), date: String(r.date), author: String(r.author ?? ""), description: String(r.description ?? ""), status: r.status as RevisionStatus }));
}

/** Nueva emisión al final del historial (devuelve una lista nueva). */
export function appendRevision(list: Revision[], input: { author: string; description: string; status: RevisionStatus; date?: Date }): Revision[] {
  const code = nextRevisionCode(list[list.length - 1]?.code);
  const rev: Revision = { code, date: (input.date ?? new Date()).toISOString(), author: input.author.trim().slice(0, 80), description: input.description.trim().slice(0, 300), status: input.status };
  return [...list, rev].slice(-MAX_REVISIONS);
}

export const currentRevision = (list: Revision[]): Revision | null => list[list.length - 1] ?? null;

/** Fecha corta argentina (dd/mm/aaaa) de una revisión. */
export const revisionDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "America/Argentina/Buenos_Aires" });
};

export type RevisionRow = { code: string; date: string; status: string; description: string; author: string; current: boolean };

/** Renglones de la tabla de revisiones de la primera lámina: la más nueva arriba, como en los rótulos de obra. */
export function revisionTableRows(list: Revision[], max = 8): RevisionRow[] {
  return list
    .map((r, i) => ({ code: r.code, date: revisionDate(r.date), status: REVISION_STATUS_LABEL[r.status], description: r.description || "—", author: r.author || "—", current: i === list.length - 1 }))
    .reverse()
    .slice(0, max);
}

/** Lo que va en la cartela: letra y estado de la revisión vigente. */
export function cartelaRevision(list: Revision[]): { code: string; status: string } {
  const cur = currentRevision(list);
  return cur ? { code: cur.code, status: REVISION_STATUS_LABEL[cur.status] } : { code: DRAFT_REVISION.code, status: DRAFT_REVISION.statusLabel };
}
