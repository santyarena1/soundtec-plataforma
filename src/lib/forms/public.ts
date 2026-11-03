import { prisma } from "@/lib/prisma";
import { isBlockType, readConfig, readSettings, type FormSettings, type PublicBlock } from "@/lib/forms/types";
import { sanitizeFormHtml } from "@/lib/forms/sanitize";

export type PublicForm = {
  id: string;
  title: string;
  token: string;
  settings: FormSettings;
  blocks: PublicBlock[];
  /** Abierto para responder ahora (estado OPEN y sin vencer). */
  open: boolean;
  closedReason: string | null;
};

/** Formulario por su enlace secreto, con los textos ya saneados. Null si el enlace no existe. */
export async function loadPublicForm(token: string, options?: { preview?: boolean }): Promise<PublicForm | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
  const form = await prisma.form.findUnique({
    where: { token },
    include: { blocks: { orderBy: { sortOrder: "asc" } } },
  });
  if (!form) return null;
  const expired = form.closesAt != null && form.closesAt.getTime() < Date.now();
  const open = options?.preview ? true : form.status === "OPEN" && !expired;
  const closedReason = open
    ? null
    : form.status === "DRAFT"
      ? "Este formulario todavía no está abierto."
      : "Este formulario ya no recibe respuestas.";
  const settings = readSettings(form.settings);
  return {
    id: form.id,
    title: form.title,
    token: form.token,
    settings: {
      ...settings,
      welcomeBody: sanitizeFormHtml(settings.welcomeBody),
      endBody: sanitizeFormHtml(settings.endBody),
    },
    blocks: form.blocks
      .filter((b) => isBlockType(b.type))
      .map((b) => ({
        id: b.id,
        type: b.type as PublicBlock["type"],
        title: b.title,
        body: sanitizeFormHtml(b.body),
        required: b.required,
        config: readConfig(b.config),
      })),
    open,
    closedReason,
  };
}
