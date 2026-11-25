// Empresa (Client) pausada: sus usuarios del portal no entran ni siguen con la sesión abierta.

export const CLIENT_PAUSED_MESSAGE = "Tu cuenta está pausada. Escribinos a comercial@soundtec.com.ar";

/** Motivo de /salir y aviso del login cuando la empresa del usuario está pausada. */
export const CLIENT_PAUSED_REASON = "pausada";

export interface ClientAccessInput {
  role: string;
  client: { isActive: boolean } | null | undefined;
}

/**
 * Solo frena a usuarios del portal (CLIENT) cuya empresa está inactiva. El equipo
 * (aunque tenga una empresa asignada) y los clientes sin empresa siguen como estaban.
 */
export function isClientAccessPaused(user: ClientAccessInput): boolean {
  return user.role === "CLIENT" && user.client != null && user.client.isActive === false;
}
