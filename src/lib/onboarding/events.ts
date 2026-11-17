/** Evento para reiniciar / abrir el paseo desde Ayuda u otros controles. */
export const ONBOARDING_START_EVENT = "soundtec:onboarding-start";

/** El paseo está visible: el changelog y otros popups deben ceder. */
export const ONBOARDING_ACTIVE_EVENT = "soundtec:onboarding-active";

/** El paseo se cerró (completado, saltado o idle). */
export const ONBOARDING_INACTIVE_EVENT = "soundtec:onboarding-inactive";

export type OnboardingStartDetail = {
  /** Arranca directo en el primer paso, sin el cartel de bienvenida (ya se eligió «recorrido guiado»). */
  skipWelcome?: boolean;
};

export function requestOnboardingStart(detail: OnboardingStartDetail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OnboardingStartDetail>(ONBOARDING_START_EVENT, { detail }));
}

export function notifyOnboardingActive() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_ACTIVE_EVENT));
}

export function notifyOnboardingInactive() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(ONBOARDING_INACTIVE_EVENT));
}
