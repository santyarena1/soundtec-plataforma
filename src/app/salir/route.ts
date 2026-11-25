import { cookies } from "next/headers";
import { signOut } from "@/lib/auth";
import { IMPERSONATION_COOKIE } from "@/lib/impersonation/token";
import { CLIENT_PAUSED_REASON } from "@/lib/client-access";

const REASONS = new Set(["inactivo", "cambios", "usuario", "clave", CLIENT_PAUSED_REASON]);

/**
 * Cierra la sesión del navegador y vuelve al login con el motivo. Lo usa
 * requireUser cuando la sesión dejó de valer (usuario desactivado, clave
 * reseteada, tipo de usuario cambiado) y el cambio de clave obligatorio.
 */
export async function GET(req: Request) {
  const motivo = new URL(req.url).searchParams.get("motivo") ?? "";
  const reason = REASONS.has(motivo) ? motivo : "cerrada";
  // Una vista «Ver como» abierta no sobrevive al cierre de la sesión del admin.
  cookies().delete(IMPERSONATION_COOKIE);
  await signOut({ redirectTo: `/login?sesion=${reason}` });
}
