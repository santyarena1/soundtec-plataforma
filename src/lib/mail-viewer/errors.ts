import { MailboxError } from "./types";

/**
 * Error de IMAP → mensaje para la pantalla. Nunca repite datos de la cuenta ni
 * la respuesta cruda del servidor (puede traer el usuario).
 */
export function toMailboxError(error: unknown): MailboxError {
  if (error instanceof MailboxError) return error;
  const e = (error ?? {}) as { authenticationFailed?: boolean; code?: string; message?: string; responseText?: string };
  const text = `${e.code ?? ""} ${e.message ?? ""} ${e.responseText ?? ""}`;
  if (e.authenticationFailed || /AUTHENTICATIONFAILED|authentication failed|invalid credentials|login failed|\bAUTH/i.test(text)) {
    return new MailboxError("No se pudo entrar a la casilla: el usuario o la contraseña no coinciden. Revisá Configuración › Correo.", "auth");
  }
  if (/ETIMEDOUT|timeout|timed out|NoConnection|tiempo/i.test(text)) {
    return new MailboxError("La casilla tardó demasiado en responder. Probá de nuevo en un rato.", "timeout");
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|EHOSTUNREACH|certificate|TLS|socket/i.test(text)) {
    return new MailboxError("No se pudo conectar a la casilla: revisá Configuración › Correo (servidor y puerto IMAP).", "connect");
  }
  if (/NONEXISTENT|not found|doesn'?t exist|no such mailbox|Mailbox does not exist/i.test(text)) {
    return new MailboxError("Esa carpeta o ese mensaje ya no está en la casilla.", "not_found");
  }
  return new MailboxError("No se pudo leer la casilla. Probá de nuevo; si sigue, revisá Configuración › Correo.", "connect");
}
