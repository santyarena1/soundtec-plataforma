"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/input";
import { ACTIVITY_OPTIONS } from "@/lib/expo/account-request-schema";
import { submitAccountRequest, type FieldErrors } from "@/server/actions/account-requests";

type Prefill = { fullName?: string; email?: string; phone?: string; company?: string };
type Sent = { name: string; email: string; company: string };

export function AccountRequestForm({ prefill }: { prefill: Prefill }) {
  const [pending, start] = useTransition();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<Sent | null>(null);
  const [activity, setActivity] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fd = new FormData(event.currentTarget);
    const text = (k: string) => String(fd.get(k) ?? "").trim();
    start(async () => {
      const r = await submitAccountRequest(fd);
      if (r.ok) {
        window.scrollTo({ top: 0 });
        return setSent({ name: text("fullName").split(/\s+/)[0] ?? "", email: text("email").toLowerCase(), company: text("company") });
      }
      setError(r.error);
      setErrors(r.fieldErrors ?? {});
    });
  }

  if (sent) {
    return (
      <div className="mt-6 rounded-2xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-8 w-8 shrink-0 text-emerald-600" />
          <div>
            <h2 className="text-lg font-semibold">
              Listo{sent.name ? `, ${sent.name}` : ""}. Recibimos la solicitud de {sent.company}.
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">No tenés que hacer nada más por ahora.</p>
          </div>
        </div>
        <ol className="mt-5 space-y-3 text-sm">
          <Step n={1} done>
            Nos llegaron los datos de la empresa.
          </Step>
          <Step n={2}>Los revisa el equipo comercial de Soundtec.</Step>
          <Step n={3}>
            Cuando la aprobamos, te mandamos a <strong className="[overflow-wrap:anywhere]">{sent.email}</strong> (o por WhatsApp) un link para crear tu contraseña.
          </Step>
          <Step n={4}>Con esa contraseña entrás al portal: precios para tu empresa, pedidos y cotizaciones.</Step>
        </ol>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/catalogo" className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground">
            Seguir viendo el catálogo
          </Link>
          <a href="mailto:contacto@soundtec.com.ar" className="inline-flex h-11 items-center rounded-md border border-border px-5 text-sm font-medium">
            Escribirnos
          </a>
        </div>
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

  const hasAccount = errors.email === "Ya tiene cuenta";

  return (
    <>
      <ol className="mt-4 grid gap-2 rounded-xl border border-border bg-card p-4 text-sm sm:grid-cols-3 sm:gap-3">
        <li>
          <span className="font-semibold">1. Completás esto</span>
          <span className="block text-xs text-muted-foreground">Toma un par de minutos.</span>
        </li>
        <li>
          <span className="font-semibold">2. Lo revisamos</span>
          <span className="block text-xs text-muted-foreground">El equipo comercial valida la empresa.</span>
        </li>
        <li>
          <span className="font-semibold">3. Creás tu clave</span>
          <span className="block text-xs text-muted-foreground">Te llega el link por mail o WhatsApp.</span>
        </li>
      </ol>
      <p className="mt-3 text-sm text-muted-foreground">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="font-semibold text-primary hover:underline">
          Ingresá acá
        </Link>
      </p>
      <form onSubmit={onSubmit} className="mt-6 space-y-6">
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tus datos</legend>
          {field("fullName", "Nombre y apellido *", { required: true, defaultValue: prefill.fullName, autoComplete: "name" })}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("email", "Mail (con este vas a entrar) *", { required: true, type: "email", defaultValue: prefill.email, autoComplete: "email", inputMode: "email" })}
            {field("phone", "Teléfono / WhatsApp *", { required: true, type: "tel", defaultValue: prefill.phone, autoComplete: "tel", inputMode: "tel" })}
          </div>
        </fieldset>
        <fieldset className="space-y-4">
          <legend className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tu empresa</legend>
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem]">
            {field("company", "Razón social *", { required: true, defaultValue: prefill.company, autoComplete: "organization" })}
            {field("cuit", "CUIT *", { required: true, inputMode: "numeric", placeholder: "30-12345678-9" })}
          </div>
          <div>
            <Label htmlFor="ar-activity">A qué se dedica *</Label>
            <Select id="ar-activity" name="activity" required value={activity} onChange={(e) => setActivity(e.target.value)}>
              <option value="" disabled>
                Elegí una opción
              </option>
              {ACTIVITY_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o}
                </option>
              ))}
            </Select>
            <FieldError message={errors.activity} />
          </div>
          {activity === "Otra" ? field("activityOther", "Contanos el rubro *", { required: true }) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            {field("location", "Ciudad y provincia")}
            {field("website", "Web o Instagram")}
          </div>
          <div>
            <Label htmlFor="ar-comment">Comentario (opcional)</Label>
            <Textarea id="ar-comment" name="comment" rows={3} placeholder="Qué tipo de obras hacen, qué marcas trabajan…" />
          </div>
        </fieldset>
        <input type="text" name="hp" tabIndex={-1} autoComplete="off" className="hidden" aria-hidden="true" />
        {error ? (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            {error}
            {hasAccount ? (
              <Link href="/login" className="mt-2 block font-semibold underline">
                Ir a ingresar
              </Link>
            ) : null}
          </div>
        ) : null}
        <Button type="submit" className="h-12 w-full text-base" disabled={pending}>
          {pending ? "Enviando…" : "Enviar solicitud"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">Usamos estos datos solo para tu cuenta. No los compartimos ni mandamos publicidad.</p>
      </form>
    </>
  );
}

function Step({ n, done = false, children }: { n: number; done?: boolean; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-emerald-600 text-white" : "bg-secondary text-foreground"}`}
      >
        {n}
      </span>
      <span className="pt-0.5">{children}</span>
    </li>
  );
}
