import type { OnboardingHandoff } from "./types";

export const ONBOARDING_HANDOFF_STORAGE_KEY = "soundtec:onboarding-handoff";

export function writeHandoffLocal(handoff: OnboardingHandoff | null) {
  if (typeof window === "undefined") return;
  try {
    if (!handoff) {
      sessionStorage.removeItem(ONBOARDING_HANDOFF_STORAGE_KEY);
      return;
    }
    sessionStorage.setItem(ONBOARDING_HANDOFF_STORAGE_KEY, JSON.stringify(handoff));
  } catch {
    /* ignore */
  }
}

export function readHandoffLocal(): OnboardingHandoff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(ONBOARDING_HANDOFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OnboardingHandoff;
    if (!parsed?.from || !parsed?.to) return null;
    return parsed;
  } catch {
    return null;
  }
}
