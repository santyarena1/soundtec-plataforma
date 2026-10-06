"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { submitWelcomeLead } from "@/server/actions/visitor-lead";

/** Consulta por una marca sin productos cargados: queda como lead en el CRM. */
export function BrandInquiryForm({ brandName }: { brandName: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  if (sent) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-emerald-900">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">¡Gracias! Recibimos tu consulta.</p>
          <p className="mt-1 text-sm">Te contactamos a la brevedad con la información de {brandName}.</p>
        </div>
      </div>
    );
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const message = String(fd.get("message") ?? "").trim();
        fd.set("interest", `Consulta por ${brandName}${message ? `: ${message}` : ""}`);
        fd.delete("message");
        setError(null);
        start(async () => {
          const r = await submitWelcomeLead(fd);
          if (!r.ok) setError(r.error);
          else setSent(true);
        });
      }}
    >
      <div>
        <Label htmlFor="q-email">Mail *</Label>
        <Input id="q-email" name="email" type="email" required autoComplete="email" inputMode="email" placeholder="tu@empresa.com" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="q-name">Nombre</Label>
          <Input id="q-name" name="name" autoComplete="name" />
        </div>
        <div>
          <Label htmlFor="q-company">Empresa</Label>
          <Input id="q-company" name="company" autoComplete="organization" />
        </div>
      </div>
      <div>
        <Label htmlFor="q-phone">Teléfono</Label>
        <Input id="q-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" />
      </div>
      <div>
        <Label htmlFor="q-message">¿Qué necesitás?</Label>
        <Textarea id="q-message" name="message" rows={3} maxLength={900} placeholder={`Productos de ${brandName}, cantidades, proyecto…`} />
      </div>
      {/* honeypot: invisible para personas */}
      <input type="text" name="hp_url" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {pending ? "Enviando…" : "Enviar consulta"}
      </Button>
      <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
        <Lock className="h-3 w-3" /> No hacemos spam. Usamos tus datos solo para responder tu consulta.
      </p>
    </form>
  );
}
