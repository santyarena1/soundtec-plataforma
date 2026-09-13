"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { EMPTY_LEAD, type LeadFormValues } from "./types";

/**
 * Formulario de contacto. Ningún campo es obligatorio y no hay asteriscos:
 * el visitante deja lo que quiera, o nada.
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

  return (
    <form
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(values);
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="expo-name">Nombre</Label>
          <Input
            id="expo-name"
            autoComplete="name"
            value={values.name}
            onChange={(event) => update("name", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="expo-company">Empresa</Label>
          <Input
            id="expo-company"
            autoComplete="organization"
            value={values.company}
            onChange={(event) => update("company", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="expo-email">Mail</Label>
          <Input
            id="expo-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={values.email}
            onChange={(event) => update("email", event.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="expo-phone">Teléfono</Label>
          <Input
            id="expo-phone"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            value={values.phone}
            onChange={(event) => update("phone", event.target.value)}
          />
        </div>
      </div>
      <div>
        <Label htmlFor="expo-project">Información del proyecto</Label>
        <Textarea
          id="expo-project"
          rows={3}
          placeholder="Contanos qué estás evaluando: tipo de espacio, cantidad de zonas, plazos…"
          value={values.projectInfo}
          onChange={(event) => update("projectInfo", event.target.value)}
        />
      </div>

      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button type="button" variant="ghost" onClick={onSkip} disabled={pending}>
          {skipLabel}
        </Button>
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
