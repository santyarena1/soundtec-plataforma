"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { activateAccount } from "@/server/actions/activate-account";
import { PasswordInput } from "@/components/ui/password-input";

export function ActivateForm({ token, email }: { token: string; email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (done) {
    return (
      <div className="text-center">
        <p className="font-semibold">¡Listo! Tu cuenta está activa.</p>
        <Link href={`/login?email=${encodeURIComponent(email)}`} className="mt-4 inline-flex h-11 items-center rounded-md bg-primary px-6 text-sm font-semibold text-primary-foreground">
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
          const r = await activateAccount(fd);
          if (!r.ok) return setError(r.error);
          setDone(true);
        });
      }}
    >
      <input type="hidden" name="token" value={token} />
      <div><Label htmlFor="pw">Contraseña</Label><PasswordInput id="pw" name="password" required minLength={10} autoComplete="new-password" /><p className="mt-1 text-xs text-muted-foreground">Mínimo 10 caracteres, con letras y números.</p></div>
      <div><Label htmlFor="pw2">Repetir contraseña</Label><PasswordInput id="pw2" name="confirm" required minLength={10} autoComplete="new-password" /></div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full" disabled={pending}>{pending ? "Guardando…" : "Crear contraseña"}</Button>
    </form>
  );
}
