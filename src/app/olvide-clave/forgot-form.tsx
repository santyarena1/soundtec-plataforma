"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { requestPasswordReset } from "@/server/actions/password-reset";

export function ForgotForm({ initialEmail }: { initialEmail: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-md border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
          <MailCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <p>{done}</p>
        </div>
        <Link href="/login" className="inline-flex h-11 w-full items-center justify-center rounded-md border border-border text-sm font-semibold hover:bg-secondary">
          Volver a ingresar
        </Link>
      </div>
    );
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        setError(null);
        start(async () => {
          try {
            const r = await requestPasswordReset(fd);
            if (!r.ok) return setError(r.error);
            setDone(r.message);
          } catch {
            setError("No pudimos procesar el pedido. Probá de nuevo en unos minutos.");
          }
        });
      }}
    >
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {/* Campo trampa para bots: invisible para personas. */}
      <input type="text" name="hp" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="usuario@empresa.com" defaultValue={initialEmail} className="h-11" required autoFocus />
      </div>
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {pending ? "Enviando…" : "Mandarme el link"}
      </Button>
    </form>
  );
}
