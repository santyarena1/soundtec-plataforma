"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_OPTIONS } from "@/lib/expo/account-request-schema";
import { submitAccountRequest, type FieldErrors } from "@/server/actions/account-requests";

type Prefill = { fullName?: string; email?: string; phone?: string; company?: string };

export function AccountRequestForm({ prefill }: { prefill: Prefill }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [activity, setActivity] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    start(async () => {
      const r = await submitAccountRequest(fd);
      if (r.ok) return setDone(true);
      setError(r.error);
      setErrors(r.fieldErrors ?? {});
    });
  }

  if (done) {
    return (
      <div className="mt-8 rounded-2xl border border-border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
        <h2 className="mt-3 text-lg font-semibold">¡Recibimos tu solicitud!</h2>
        <p className="mt-1 text-sm text-muted-foreground">La revisamos y te contactamos para activar tu cuenta.</p>
        <Link href="/catalogo" className="mt-5 inline-block text-sm font-semibold text-primary underline">Volver al catálogo</Link>
      </div>
    );
  }

  const field = (name: string, label: string, props: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <div>
      <Label htmlFor={`ar-${name}`}>{label}</Label>
      <Input id={`ar-${name}`} name={name} {...props} />
      <FieldError message={errors[name]} />
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {field("fullName", "Nombre y apellido *", { required: true, defaultValue: prefill.fullName, autoComplete: "name" })}
      {field("email", "Mail *", { required: true, type: "email", defaultValue: prefill.email, autoComplete: "email", inputMode: "email" })}
      {field("phone", "Teléfono / WhatsApp *", { required: true, type: "tel", defaultValue: prefill.phone, autoComplete: "tel", inputMode: "tel" })}
      {field("company", "Empresa *", { required: true, defaultValue: prefill.company, autoComplete: "organization" })}
      {field("cuit", "CUIT *", { required: true, inputMode: "numeric", placeholder: "30-12345678-9" })}
      <div>
        <Label htmlFor="ar-activity">Actividad de la empresa *</Label>
        <Select id="ar-activity" name="activity" required value={activity} onChange={(e) => setActivity(e.target.value)}>
          <option value="" disabled>Elegí una opción</option>
          {ACTIVITY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <FieldError message={errors.activity} />
      </div>
      {activity === "Otra" ? field("activityOther", "¿A qué se dedica? *", { required: true }) : null}
      {field("location", "Provincia / ciudad")}
      {field("website", "Web o Instagram")}
      <div>
        <Label htmlFor="ar-comment">Comentario</Label>
        <Textarea id="ar-comment" name="comment" rows={3} placeholder="Qué proyectos hacen, qué marcas les interesan…" />
      </div>
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
        {pending ? "Enviando…" : "Enviar solicitud"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">No hacemos spam. Usamos tus datos solo para tu cuenta.</p>
    </form>
  );
}
