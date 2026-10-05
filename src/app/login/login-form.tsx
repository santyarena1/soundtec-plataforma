"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";
import { PasswordInput } from "@/components/ui/password-input";

/** API de credenciales del navegador (Chrome/Edge); no está en los tipos de TS. */
type PasswordCredentialCtor = new (form: HTMLFormElement) => Credential;

/**
 * Le pide al navegador que guarde usuario y contraseña. El login entra sin
 * recargar la página y Chrome a veces no se da cuenta de que fue exitoso.
 */
async function rememberCredentials(form: HTMLFormElement): Promise<void> {
  const Ctor = (window as Window & { PasswordCredential?: PasswordCredentialCtor }).PasswordCredential;
  if (!Ctor || !navigator.credentials?.store) return;
  try {
    await navigator.credentials.store(new Ctor(form));
  } catch {
    // Si el navegador no lo permite, sigue el ingreso normal.
  }
}

interface LoginFormProps {
  callbackUrl?: string;
  initialError?: string;
}

export function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(initialError ? "Credenciales inválidas." : null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");

    if (!email || !password) {
      setError("Completá email y contraseña.");
      return;
    }

    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
        callbackUrl: callbackUrl || searchParams.get("callbackUrl") || "/portal",
      });
      if (!result || result.error) {
        setError("Credenciales inválidas o usuario inactivo.");
        return;
      }
      await rememberCredentials(form);
      // Navegación completa: además de cargar la sesión, es la señal de "ingreso exitoso" para el gestor de contraseñas.
      window.location.assign(result.url || callbackUrl || "/portal");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error ? (
        <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <Label htmlFor="email" required>
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="username" placeholder="usuario@empresa.com" defaultValue={searchParams.get("email") ?? undefined} className="h-11" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          Contraseña
        </Label>
        <PasswordInput id="password" name="password" autoComplete="current-password" className="h-11" required />
        <FieldError />
      </div>

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Ingresando..." : "Iniciar sesión"}
      </Button>
    </form>
  );
}
