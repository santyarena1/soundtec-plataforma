"use client";

import { useState, useTransition } from "react";
import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/input";
import { AlertCircle, Loader2 } from "lucide-react";

interface LoginFormProps {
  callbackUrl?: string;
  initialError?: string;
}

export function LoginForm({ callbackUrl, initialError }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(initialError ? "Credenciales inválidas." : null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const formData = new FormData(event.currentTarget);
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
      router.replace(result.url || callbackUrl || "/portal");
      router.refresh();
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
        <Input id="email" name="email" type="email" autoComplete="email" placeholder="usuario@empresa.com" required />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password" required>
          Contraseña
        </Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required />
        <FieldError />
      </div>

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isPending ? "Ingresando..." : "Iniciar sesión"}
      </Button>
    </form>
  );
}
