"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

type Result = { ok: true } | { ok: false; error: string };

/** Ejecuta una decisión, refresca la vista y deja el error a mano para mostrarlo. */
export function useDecision() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function run(action: () => Promise<Result>) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }
  return { pending, error, run };
}

export const usd = (value: number) =>
  `USD ${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
