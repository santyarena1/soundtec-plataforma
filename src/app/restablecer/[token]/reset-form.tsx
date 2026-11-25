"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { resetPassword } from "@/server/actions/password-reset";

export function ResetForm({ token }: { token: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ email: string; twoFactor: boolean } | null>(null);

  if (done) {
    return (
      <div className="space-y-4">
        <p className="font-semibold">Listo: tu clave quedó cambiada.</p>
        <p className="text-sm text-muted-foreground">Por seguridad cerramos las sesiones que tenías abiertas en otros dispositivos.</p>
        {done.twoFactor ? (
          <div className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Tu cuenta tiene verificación en dos pasos: al ingresar te vamos a pedir también el código de tu app.</span>
          </div>
        ) : null}
        <Link href={`/login?email=${encodeURIComponent(done.email)}`} className="inline-flex h-11 w-full items-center justify-center rounded-md bg-primary text-sm font-semibold text-primary-foreground">
          Ingresar
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
        start(async () => {
          try {
            const r = await resetPassword(fd);
            if (!r.ok) return setError(r.error);
            setDone({ email: r.email, twoFactor: r.twoFactor });
          } catch {
            setError("No pudimos guardar la clave. Probá de nuevo en unos minutos.");
          }
        });
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div>
        <Label htmlFor="pw">Clave nueva</Label>
        <PasswordInput id="pw" name="password" required minLength={10} autoComplete="new-password" />
        <p className="mt-1 text-xs text-muted-foreground">Mínimo 10 caracteres, con letras y números.</p>
      </div>
      <div>
        <Label htmlFor="pw2">Repetir clave</Label>
        <PasswordInput id="pw2" name="confirm" required minLength={10} autoComplete="new-password" />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar clave nueva"}
      </Button>
    </form>
  );
}
