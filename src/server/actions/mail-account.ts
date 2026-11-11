"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requirePermission } from "@/lib/auth-helpers";
import { getMailAccount, saveMailAccount, testMailAccount } from "@/lib/mail/account";

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const accountSchema = z.object({
  host: z.string().trim().min(3).max(200),
  user: z.string().trim().email("El usuario es la dirección de mail completa."),
  password: z.string().max(500).optional(),
  fromName: z.string().trim().min(1).max(100),
  smtpPort: z.coerce.number().int().min(1).max(65535),
  imapPort: z.coerce.number().int().min(1).max(65535),
});

/** Guarda la cuenta de correo (la contraseña va cifrada; vacía = no se cambia). */
export async function saveMailAccountAction(input: unknown): Promise<Result> {
  await requirePermission("api_keys.manage");
  const parsed = accountSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos." };
  await saveMailAccount({ ...parsed.data, password: parsed.data.password?.trim() || undefined });
  revalidatePath("/admin/settings/correo");
  return { ok: true };
}

/** Prueba la cuenta guardada: envío (SMTP) y lectura (IMAP). */
export async function testMailAccountAction(): Promise<Result<{ smtp: string | null; imap: string | null }>> {
  await requirePermission("api_keys.manage");
  const account = await getMailAccount();
  if (!account) return { ok: false, error: "Falta cargar el mail y la contraseña." };
  return { ok: true, ...(await testMailAccount(account)) };
}
