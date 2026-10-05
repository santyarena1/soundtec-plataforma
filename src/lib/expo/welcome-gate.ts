export type WelcomeMode = "REQUIRED" | "OPTIONAL" | "NONE";

/** Regla de la bienvenida del catálogo (ver spec §2). */
export function decideWelcome(input: { hasLead: boolean; skipped: boolean; qrEventLive: boolean }): WelcomeMode {
  if (input.hasLead) return "NONE";
  if (input.qrEventLive) return "REQUIRED";
  return input.skipped ? "NONE" : "OPTIONAL";
}
