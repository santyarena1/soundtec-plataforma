"use client";

import type { ReactNode } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { saveSettingWithFeedback } from "@/server/actions/settings";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Guardando…" : "Guardar"}
    </Button>
  );
}

/** Formulario de un ajuste: guarda y muestra si se guardó o por qué no. */
export function SettingFieldForm({ children }: { children: ReactNode }) {
  const [state, action] = useFormState(saveSettingWithFeedback, null);
  return (
    <form
      action={action}
      className="grid gap-2 py-4 first:pt-3 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3"
    >
      {children}
      <SubmitButton />
      {state ? (
        <p role="status" className={`text-xs sm:col-span-2 ${state.ok ? "text-emerald-600" : "text-destructive"}`}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
