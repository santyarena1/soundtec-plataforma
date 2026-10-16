import { signOut } from "@/lib/auth";

const REASONS = new Set(["inactivo", "cambios", "usuario", "clave"]);

/**
 * Cierra la sesión del navegador y vuelve al login con el motivo. Lo usa
 * requireUser cuando la sesión dejó de valer (usuario desactivado, clave
 * reseteada, tipo de usuario cambiado) y el cambio de clave obligatorio.
 */
export async function GET(req: Request) {
  const motivo = new URL(req.url).searchParams.get("motivo") ?? "";
  const reason = REASONS.has(motivo) ? motivo : "cerrada";
  await signOut({ redirectTo: `/login?sesion=${reason}` });
}
