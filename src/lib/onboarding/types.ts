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
  /** Ruta donde se muestra el paso (se navega si hace falta). */
  route: string;
  /** data-tour del elemento a resaltar. Sin target = tooltip centrado. */
  target?: string;
  title: string;
  body: string;
  tip?: string;
  affects?: string;
};

export type OnboardingTour = {
  id: OnboardingSurface;
  title: string;
  subtitle: string;
  welcomeTitle: string;
  welcomeBody: string;
  steps: OnboardingStep[];
};
