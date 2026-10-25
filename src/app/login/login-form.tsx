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

/** Solo rutas del propio sitio: un enlace con callbackUrl=https://otro-sitio no saca al usuario afuera. */
function safeCallback(value: string | null | undefined): string | null {
  return value && /^\/(?!\/)/.test(value) && !value.includes("\\") ? value : null;
}

interface LoginFormProps {
  callbackUrl?: string;
  initialError?: string;
}

export function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(initialError ? "Credenciales inválidas." : null);
  // Verificación en dos pasos: la contraseña ya fue aceptada, falta el código de la app.
  const [needsCode, setNeedsCode] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = event.currentTarget;
    const formData = new FormData(form);
    const email = String(formData.get("email") || "").trim();
    const password = String(formData.get("password") || "");
    const code = String(formData.get("code") || "").replace(/s+/g, "");

    if (!email || !password) {
      setError("Completá email y contraseña.");
      return;
    }

    const target = safeCallback(callbackUrl) || safeCallback(searchParams.get("callbackUrl")) || "/portal";
    startTransition(async () => {
      const result = await signIn("credentials", {
        email,
        password,
        ...(needsCode ? { code } : {}),
        redirect: false,
        callbackUrl: target,
      });
      if (result?.code === "totp_required") {
        setNeedsCode(true);
        setError(null);
        return;
      }
      if (!result || result.error) {
        if (result?.code === "totp_invalid") {
          setError("El código no es correcto o ya venció. Fijate el que muestra ahora la app.");
          return;
        }
        setError(
          result?.code === "too_many_attempts"
            ? "Demasiados intentos. Por seguridad, esperá 15 minutos y probá de nuevo (o pedí que te reseteen la contraseña)."
            : "Credenciales inválidas o usuario inactivo."
        );
        return;
      }
      await rememberCredentials(form);
      // Navegación completa: además de cargar la sesión, es la señal de "ingreso exitoso" para el gestor de contraseñas.
      const next = result.url ? new URL(result.url, window.location.origin) : null;
      window.location.assign(next && next.origin === window.location.origin ? next.pathname + next.search : target);
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

      {needsCode ? (
        <div className="space-y-1.5 rounded-md border border-primary/30 bg-primary/5 p-3">
          <Label htmlFor="code" required>
            Código de verificación
          </Label>
          <p className="text-xs text-muted-foreground">Abrí la app de autenticación (Google Authenticator u otra) y escribí el código de 6 dígitos de Soundtec.</p>
          <Input id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} autoFocus className="h-11 text-center text-lg tracking-[0.3em]" required />
        </div>
      ) : null}

      <Button type="submit" className="h-11 w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Ingresando..." : needsCode ? "Verificar e ingresar" : "Iniciar sesión"}
      </Button>
    </form>
  );
}
