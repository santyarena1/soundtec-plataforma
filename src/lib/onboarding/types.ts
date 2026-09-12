export type OnboardingSurface = "admin" | "portal";

export type OnboardingStatus = "pending" | "in_progress" | "completed" | "skipped";

export type OnboardingSurfaceState = {
  status: OnboardingStatus;
  stepIndex?: number;
  completedStepIds?: string[];
  updatedAt?: string;
  completedAt?: string;
  skippedAt?: string;
};

export type OnboardingState = {
  admin?: OnboardingSurfaceState;
  portal?: OnboardingSurfaceState;
};

export type OnboardingStep = {
  id: string;
  /**
   * Ruta de referencia del paso (donde suele estar el target).
   * El host NO navega solo: si hace falta otra pantalla, se indica con requirePath.
   */
  route: string;
  /** data-tour del elemento a resaltar. Sin target = tarjeta centrada. */
  target?: string;
  title: string;
  body: string;
  bullets?: string[];
  tip?: string;
  affects?: string;
  /**
   * Espera a que el usuario abra esta ruta (haciendo click en el menú).
   * Mientras tanto “Siguiente” queda bloqueado.
   */
  requirePath?: string;
  /** Al cumplir requirePath, avanza solo al siguiente paso. */
  autoAdvanceOnRoute?: boolean;
};

export type OnboardingTour = {
  id: OnboardingSurface;
  title: string;
  subtitle: string;
  welcomeTitle: string;
  welcomeBody: string;
  steps: OnboardingStep[];
};
