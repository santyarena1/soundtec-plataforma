"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { skipWelcome, submitWelcomeLead } from "@/server/actions/visitor-lead";

/**
 * Bienvenida del catálogo (mobile-first) como overlay a pantalla completa:
 * el catálogo se renderiza siempre debajo (los crawlers lo ven igual).
 * `required` = vino por QR de un evento vigente: no hay "Saltear".
 */
export function WelcomeScreen({ required }: { required: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    setError(null);
    start(async () => {
      const r = await submitWelcomeLead(fd);
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  function onSkip() {
    start(async () => {
      const r = await skipWelcome();
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  }

  return (
    <div role="dialog" aria-modal="true" aria-labelledby="welcome-title" className="fixed inset-0 z-50 overflow-y-auto bg-background">
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/landing/logo_soundtec.png" alt="Soundtec" className="mx-auto mb-6 h-16 w-auto" />
      <h2 id="welcome-title" className="text-center text-2xl font-semibold">¡Bienvenido a Soundtec!</h2>
      <p className="mt-2 text-center text-sm text-muted-foreground">
        Dejanos tu mail para explorar el catálogo y recibir la info que te interese.
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-3">
        <div>
          <Label htmlFor="w-email">Mail *</Label>
          <Input id="w-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="tu@empresa.com" />
        </div>
        <div>
          <Label htmlFor="w-name">Nombre (opcional)</Label>
          <Input id="w-name" name="name" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="w-company">Empresa (opcional)</Label>
          <Input id="w-company" name="company" autoComplete="organization" />
        </div>
        <div>
          <Label htmlFor="w-phone">Teléfono (opcional)</Label>
          <Input id="w-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
        </div>
        <div>
          <Label htmlFor="w-interest">¿Qué te interesa? (opcional)</Label>
          <Textarea id="w-interest" name="interest" rows={2} placeholder="Ej.: audio para un restaurante, domótica para una casa…" />
        </div>
        {/* honeypot: invisible para personas */}
        <input type="text" name="hp_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
          {pending ? "Entrando…" : "Entrar al catálogo →"}
        </Button>
        <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <Lock className="h-3 w-3" /> No hacemos spam. Usamos tus datos solo para responder tu consulta.
        </p>
      </form>
      {!required ? (
        <button type="button" onClick={onSkip} disabled={pending} className="mx-auto mt-4 text-xs text-muted-foreground underline">
          Saltear
        </button>
      ) : null}
    </div>
    </div>
  );
}
