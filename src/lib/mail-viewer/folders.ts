/**
 * Nombres en castellano y orden de las carpetas de la casilla. Puro.
 */

const SPECIAL_LABELS: Record<string, string> = {
  "\\Inbox": "Recibidos",
  "\\Sent": "Enviados",
  "\\Drafts": "Borradores",
  "\\Junk": "Spam",
  "\\Trash": "Papelera",
  "\\Archive": "Archivo",
  "\\Flagged": "Destacados",
  "\\All": "Todos",
};

const ORDER = ["\\Inbox", "\\Sent", "\\Drafts", "\\Junk", "\\Trash", "\\Archive"];

const NAME_HINTS: Array<[RegExp, string]> = [
  [/^inbox$/i, "\\Inbox"],
  [/^(sent|sent items|sent messages|enviados|elementos enviados)$/i, "\\Sent"],
  [/^(drafts|borradores)$/i, "\\Drafts"],
  [/^(spam|junk|junk e-?mail|correo no deseado)$/i, "\\Junk"],
  [/^(trash|deleted items|deleted messages|papelera|elementos eliminados)$/i, "\\Trash"],
  [/^(archive|archivo|archived)$/i, "\\Archive"],
];

/** Último tramo del nombre (INBOX.Sent → Sent). */
export function leafName(path: string, delimiter = "."): string {
  const parts = path.split(delimiter || ".");
  return parts[parts.length - 1] || path;
}

/** \Sent, \Junk… según lo que informa el servidor o, si no, por el nombre. */
export function resolveSpecialUse(path: string, specialUse: string | null | undefined, delimiter = "."): string | null {
  if (specialUse && SPECIAL_LABELS[specialUse]) return specialUse;
  if (path.toUpperCase() === "INBOX") return "\\Inbox";
  const leaf = leafName(path, delimiter);
  return NAME_HINTS.find(([re]) => re.test(leaf))?.[1] ?? null;
}

export function folderLabel(path: string, specialUse: string | null, delimiter = "."): string {
  if (specialUse && SPECIAL_LABELS[specialUse]) return SPECIAL_LABELS[specialUse]!;
  return leafName(path, delimiter);
}

/** Recibidos, Enviados, Borradores, Spam, Papelera, Archivo y después el resto por nombre. */
export function sortFolders<T extends { path: string; label: string; specialUse: string | null }>(folders: T[]): T[] {
  const rank = (f: T) => {
    const i = f.specialUse ? ORDER.indexOf(f.specialUse) : -1;
    return i === -1 ? ORDER.length : i;
  };
  return [...folders].sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label, "es", { sensitivity: "base" }));
}
