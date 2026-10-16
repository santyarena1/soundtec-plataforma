"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { changeOwnPassword } from "@/server/actions/change-password";

export function ChangePasswordForm({ email }: { email: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        start(async () => {
          const r = await changeOwnPassword(fd);
          if (!r.ok) return setError(r.error);
          // La sesión vieja ya no vale: se cierra y se entra con la clave nueva.
          window.location.assign("/salir?motivo=clave");
        });
      }}
    >
      {/* Para que el gestor de contraseñas asocie la clave nueva a esta cuenta. */}
      <input type="text" name="username" autoComplete="username" value={email} readOnly hidden />
      <div>
        <Label htmlFor="current">Clave actual (la temporal)</Label>
        <PasswordInput id="current" name="current" required autoComplete="current-password" />
      </div>
      <div>
        <Label htmlFor="pw">Clave nueva</Label>
        <PasswordInput id="pw" name="password" required minLength={10} autoComplete="new-password" />
        <p className="mt-1 text-xs text-[#1E3552]/60">Mínimo 10 caracteres, con letras y números.</p>
      </div>
      <div>
        <Label htmlFor="pw2">Repetir clave nueva</Label>
        <PasswordInput id="pw2" name="confirm" required minLength={10} autoComplete="new-password" />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button type="submit" className="h-12 w-full" disabled={pending}>
        {pending ? "Guardando…" : "Guardar clave"}
      </Button>
    </form>
  );
}
