import { getSessionOnboardingJson } from "@/lib/auth-helpers";
import type { OnboardingState } from "@/lib/onboarding/types";

/**
 * Estado del paseo de bienvenida para los layouts (admin y portal). Sale de la
 * misma consulta que valida la sesión: antes era otra lectura de auth() y del
 * usuario en cada pantalla.
 */
export async function getSessionOnboardingState(): Promise<OnboardingState> {
  const raw = await getSessionOnboardingJson();
  return raw && typeof raw === "object" ? (raw as OnboardingState) : {};
}
