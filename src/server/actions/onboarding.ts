"use server";

import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { revalidatePath } from "next/cache";
import type {
  OnboardingState,
  OnboardingStatus,
  OnboardingSurface,
  OnboardingSurfaceState,
} from "@/lib/onboarding/types";

function asState(value: unknown): OnboardingState {
  if (!value || typeof value !== "object") return {};
  return value as OnboardingState;
}

export async function getOnboardingState(): Promise<OnboardingState> {
  const session = await auth();
  if (!session?.user?.id) return {};
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { onboardingJson: true },
  });
  return asState(user?.onboardingJson);
}

export async function saveOnboardingState(input: {
  surface: OnboardingSurface;
  status: OnboardingStatus;
  stepIndex?: number;
  completedStepIds?: string[];
}) {
  const session = await auth();
  if (!session?.user?.id) return { ok: false as const, error: "Sin sesión" };

  const current = await getOnboardingState();
  const now = new Date().toISOString();
  const nextSurface: OnboardingSurfaceState = {
    status: input.status,
    stepIndex: input.stepIndex,
    completedStepIds: input.completedStepIds,
    updatedAt: now,
    ...(input.status === "completed" ? { completedAt: now } : {}),
    ...(input.status === "skipped" ? { skippedAt: now } : {}),
  };
  const next: OnboardingState = {
    ...current,
    [input.surface]: nextSurface,
  };

  await prisma.user.update({
    where: { id: session.user.id },
    data: { onboardingJson: next },
  });

  revalidatePath("/admin");
  revalidatePath("/portal");
  return { ok: true as const, state: next };
}

export async function resetOnboarding(surface: OnboardingSurface) {
  return saveOnboardingState({
    surface,
    status: "pending",
    stepIndex: 0,
    completedStepIds: [],
  });
}
