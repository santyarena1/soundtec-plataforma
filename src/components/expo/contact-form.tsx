"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EMPTY_LEAD, type LeadFormValues } from "./types";

/**
 * Formulario de contacto. Ningún campo es obligatorio y no hay asteriscos:
 * el visitante deja lo que quiera, o nada.
 *
 * Pensado primero para el teléfono: una sola columna, campos altos para el
 * dedo, teclado correcto por campo y los botones al alcance del pulgar.
 */
export function ContactForm({
  submitLabel,
  skipLabel,
  onSubmit,
  onSkip,
  pending,
}: {
  submitLabel: string;
  skipLabel: string;
  onSubmit: (values: LeadFormValues) => void;
  onSkip: () => void;
  pending: boolean;
}) {
  const [values, setValues] = useState<LeadFormValues>(EMPTY_LEAD);

  function update(field: keyof LeadFormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  const fieldClass = "h-12 text-base sm:h-10";

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="space-y-3 sm:grid sm:grid-cols-2 sm:gap-3 sm:space-y-0">
        <div className="space-y-1">
          <Label htmlFor="expo-name">Nombre</Label>
          <Input
            id="expo-name"
            autoComplete="name"
            enterKeyHint="next"
            className={fieldClass}
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expo-company">Empresa</Label>
          <Input
            id="expo-company"
            autoComplete="organization"
            enterKeyHint="next"
            className={fieldClass}
            value={values.company}
            onChange={(event) => update("company", event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expo-email">Mail</Label>
          <Input
            id="expo-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="off"
            spellCheck={false}
            enterKeyHint="next"
            className={fieldClass}
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="expo-phone">Teléfono</Label>
          <Input
            id="expo-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            enterKeyHint="next"
            className={fieldClass}
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor="expo-project">Información del proyecto</Label>
        <Textarea
          id="expo-project"
          rows={3}
          className="min-h-[80px] text-base"
          placeholder="Tipo de espacio, cantidad de zonas, plazos…"
          value={values.projectInfo}
          onChange={(event) => update("projectInfo", event.target.value)}
        />
      </div>

      <div className="space-y-2 pt-1">
        <Button type="submit" size="lg" className="w-full" disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
        <button
          type="button"
          onClick={onSkip}
          disabled={pending}
          className="w-full rounded-md py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {skipLabel}
        </button>
      </div>
    </form>
  );
}
