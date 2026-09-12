/** Evento para reiniciar / abrir el paseo desde Ayuda u otros controles. */
export const ONBOARDING_START_EVENT = "soundtec:onboarding-start";

/** El paseo está visible: el changelog y otros popups deben ceder. */
export const ONBOARDING_ACTIVE_EVENT = "soundtec:onboarding-active";

/** El paseo se cerró (completado, saltado o idle). */
export const ONBOARDING_INACTIVE_EVENT = "soundtec:onboarding-inactive";

export function requestOnboardingStart() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_START_EVENT));
}

export function notifyOnboardingActive() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_ACTIVE_EVENT));
}

export function notifyOnboardingInactive() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_INACTIVE_EVENT));
}
