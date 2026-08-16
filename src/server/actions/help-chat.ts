"use server";

import { z } from "zod";
import { getCurrentPermissions } from "@/lib/auth-helpers";
import { buildHelpKnowledge } from "@/lib/help/knowledge";
import { moduleForPath } from "@/lib/help/modules";
import { getSetting } from "@/lib/settings";

const schema = z.object({
  message: z.string().min(2).max(2000),
  pathname: z.string().max(400),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(4000),
      })
    )
    .max(12)
    .optional(),
});

export type HelpChatResult = {
  ok: true;
  answer: string;
  usedAi: boolean;
  suggestTicket: boolean;
  suggestTour: boolean;
};

function looksLikeBug(text: string) {
  return /(no funciona|error|bug|rompe|falla|no anda|no carga|no guarda|ticket|roto)/i.test(text);
}

function looksLikeTour(text: string) {
  return /(recorrer|tour|señal|señale|tutorial|dónde está|donde esta|qué botón|que boton)/i.test(text);
}

function localAnswer(message: string, pathname: string): string {
  const mod = moduleForPath(pathname);
  const q = message.toLowerCase();
  if (looksLikeBug(q)) {
    return `Parece un problema en «${mod.title}». Contame qué hiciste y qué esperabas, y usá «Crear ticket al dev»: se manda esta URL. ${mod.tips[0] || ""}`;
  }
  if (/(qué hace|que hace|para qué|para que|esta pantalla|dónde estoy|donde estoy)/i.test(q)) {
    return [
      `${mod.title}: ${mod.simple}`,
      `Para qué: ${mod.purpose}`,
      `Se edita: ${mod.editable}`,
      `No se edita: ${mod.notEditable}`,
      `Se configura: ${mod.config}`,
    ].join("\n");
  }
  const blob = [mod.simple, mod.purpose, ...mod.fields, mod.editable, mod.notEditable, ...mod.tips].join(" ");
  if (q.split(/\s+/).some((word) => word.length > 3 && blob.toLowerCase().includes(word))) {
    return [
      `${mod.title}. ${mod.purpose}`,
      ...mod.fields.slice(0, 4).map((field) => `• ${field}`),
      `Se edita: ${mod.editable}`,
      `No: ${mod.notEditable}`,
    ].join("\n");
  }
  return [
    `Estás en ${mod.title}. ${mod.simple}`,
    `Se edita: ${mod.editable}`,
    `Si querés el detalle de otro módulo, nombralo (productos, solicitudes, márgenes, roles…).`,
    `También podés Recorrer esta pantalla o abrir el tutorial.`,
  ].join("\n");
}

export async function askHelpChat(input: unknown): Promise<HelpChatResult | { ok: false; error: string }> {
  const { user, permissions } = await getCurrentPermissions();
  const isBaseAdmin = user.role === "ADMIN" || user.role === "SUPER_ADMIN";
  const hasAdmin =
    permissions.fullAccess || isBaseAdmin || permissions.scopes.some((scope) => !scope.startsWith("portal."));
  if (!hasAdmin) return { ok: false, error: "No hay sesión de admin." };

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Escribí una pregunta un poco más larga." };

  const { message, pathname, history } = parsed.data;
  const suggestTicket = looksLikeBug(message);
  const suggestTour = looksLikeTour(message) || /(qué hace|que hace|esta pantalla)/i.test(message);
  const fallback = localAnswer(message, pathname);
  const screen = moduleForPath(pathname);

  const apiKey = (await getSetting("openai.api_key", "")) || process.env.OPENAI_API_KEY || "";
  if (!apiKey) {
    return { ok: true, answer: fallback, usedAi: false, suggestTicket, suggestTour };
  }

  try {
    const OpenAI = (await import("openai")).default;
    const client = new OpenAI({ apiKey });
    const model = (await getSetting("openai.model", "")) || process.env.OPENAI_MODEL || "gpt-4o-mini";
    const knowledge = buildHelpKnowledge();
    const resp = await client.chat.completions.create({
      model,
      temperature: 0.2,
      max_tokens: 700,
      messages: [
        {
          role: "system",
          content: `Sos el asistente de ayuda del admin Soundtec. Respondé SIEMPRE en español rioplatense, breve y concreto.
Usá SOLO esta documentación. Si no está, decí que no está documentado y sugerí crear un ticket al dev.
No inventes precios, permisos ni botones que no figuren.
Si el usuario reporta un error, pedile 1-2 datos y decí que use «Crear ticket al dev».
Pantalla actual: ${screen.title} (${pathname}).
${screen.simple}

DOCUMENTACIÓN:
${knowledge}`,
        },
        ...(history || []).slice(-8).map((item) => ({
          role: item.role as "user" | "assistant",
          content: item.content,
        })),
        { role: "user", content: message },
      ],
    });
    const answer = resp.choices[0]?.message?.content?.trim() || fallback;
    return { ok: true, answer, usedAi: true, suggestTicket, suggestTour };
  } catch (error) {
    console.error("[help-chat]", error);
    return { ok: true, answer: fallback, usedAi: false, suggestTicket, suggestTour };
  }
}
