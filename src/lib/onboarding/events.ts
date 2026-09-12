/** Evento para reiniciar / abrir el paseo desde Ayuda u otros controles. */
export const ONBOARDING_START_EVENT = "soundtec:onboarding-start";

export function requestOnboardingStart() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT));
}
