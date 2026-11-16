/**
 * Estado del acceso al portal de una persona (y resumen por empresa), para
 * mostrarlo igual en el listado de clientes, la ficha y usuarios.
 */

export type PortalTone = "success" | "warning" | "destructive" | "muted" | "primary";

export type PortalUserInput = {
  isActive: boolean;
  lastLoginAt: Date | null;
  mustChangePassword: boolean;
  /** Link de activación sin usar más reciente (si hay). */
  pendingToken: { expiresAt: Date } | null;
};

export type PortalUserState = "active" | "invited" | "invite_expired" | "temp_password" | "no_login" | "disabled";

export type PortalStatus = { state: PortalUserState; label: string; tone: PortalTone; hint?: string };

const fmt = (d: Date) => d.toLocaleDateString("es-AR", { day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });

export function portalUserStatus(u: PortalUserInput, now: Date = new Date()): PortalStatus {
  if (!u.isActive) return { state: "disabled", label: "Sin acceso", tone: "muted", hint: "Desactivado: no puede entrar." };
  if (u.pendingToken) {
    return u.pendingToken.expiresAt > now
      ? { state: "invited", label: "Invitado", tone: "primary", hint: `Todavía no creó su clave. El link vence el ${fmt(u.pendingToken.expiresAt)}.` }
      : { state: "invite_expired", label: "Invitación vencida", tone: "destructive", hint: "No llegó a crear su clave. Mandale una invitación nueva." };
  }
  if (u.mustChangePassword) return { state: "temp_password", label: "Clave temporal", tone: "warning", hint: "Al entrar elige una clave propia." };
  if (u.lastLoginAt) return { state: "active", label: "Activo", tone: "success", hint: `Último ingreso: ${fmt(u.lastLoginAt)}.` };
  return { state: "no_login", label: "Sin ingresar", tone: "warning", hint: "Tiene clave pero todavía no entró." };
}

/** Resumen para una empresa: lo más importante primero (quién ya entra, quién está por entrar). */
export function clientPortalSummary(users: PortalUserInput[], now: Date = new Date()): { label: string; tone: PortalTone } {
  if (!users.length) return { label: "Sin acceso", tone: "muted" };
  const states = users.map((u) => portalUserStatus(u, now).state);
  const count = (s: PortalUserState) => states.filter((x) => x === s).length;
  const working = count("active") + count("temp_password") + count("no_login");
  if (working) return { label: working === 1 ? "Con acceso" : `Con acceso (${working})`, tone: "success" };
  if (count("invited")) return { label: "Invitado", tone: "primary" };
  if (count("invite_expired")) return { label: "Invitación vencida", tone: "destructive" };
  return { label: "Acceso desactivado", tone: "muted" };
}
