"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { saveExpoEvent } from "@/server/actions/expo-events";
import { argentinaInputToIso, toArgentinaInput } from "@/lib/expo/datetime";

type EventValues = { id: string; name: string; startsAt: string; endsAt: string; displayOrientation: string };

/** Las fechas se cargan y muestran siempre en hora argentina, sin importar la zona del navegador. */

export function EventForm({ event }: { event?: EventValues }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="grid gap-3 sm:grid-cols-2"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        for (const key of ["startsAt", "endsAt"]) {
          const iso = argentinaInputToIso(String(fd.get(key) ?? ""));
          if (!iso) return setError("Revisá las fechas del evento");
          fd.set(key, iso);
        }
        start(async () => {
          const r = await saveExpoEvent(fd);
          if (!r.ok) return setError(r.error ?? "Error");
          setError(null);
          if (!event && r.id) router.push(`/admin/settings/expo/${r.id}`);
          else router.refresh();
        });
      }}
    >
      {event ? <input type="hidden" name="id" value={event.id} /> : null}
      <div className="sm:col-span-2"><Label htmlFor="ev-name">Nombre</Label><Input id="ev-name" name="name" required defaultValue={event?.name} placeholder="Expo Tecnología 2026" /></div>
      <div><Label htmlFor="ev-start">Inicio</Label><Input id="ev-start" name="startsAt" type="datetime-local" required defaultValue={event ? toArgentinaInput(event.startsAt) : undefined} /></div>
      <div><Label htmlFor="ev-end">Fin</Label><Input id="ev-end" name="endsAt" type="datetime-local" required defaultValue={event ? toArgentinaInput(event.endsAt) : undefined} /></div>
      <div>
        <Label htmlFor="ev-or">Pantalla del stand</Label>
        <Select id="ev-or" name="displayOrientation" defaultValue={event?.displayOrientation ?? "AUTO"}>
          <option value="AUTO">Automática (según el monitor)</option>
          <option value="LANDSCAPE">Horizontal</option>
          <option value="PORTRAIT">Vertical</option>
        </Select>
      </div>
      <div className="flex items-end"><Button type="submit" disabled={pending}>{event ? "Guardar cambios" : "Crear evento"}</Button></div>
      {error ? <p className="text-sm text-destructive sm:col-span-2">{error}</p> : null}
    </form>
  );
}
