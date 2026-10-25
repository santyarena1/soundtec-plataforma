"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { confirmTwoFactor, disableTwoFactor, startTwoFactorSetup } from "@/server/actions/two-factor";

function CodeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Input
      id="totp-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={7}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/[^\d ]/g, ""))}
      placeholder="123 456"
      className="h-11 text-center text-lg tracking-[0.3em]"
    />
  );
}

export function TwoFactorPanel({ enabled, backHref }: { enabled: boolean; backHref: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const run = (fn: () => Promise<void>) =>
    start(async () => {
      setError(null);
      await fn();
    });

  if (done) {
    return (
      <div className="space-y-4">
        <p className="flex items-start gap-2 rounded-md border border-success/30 bg-success/5 p-3 text-sm">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" /> {done}
        </p>
        <Link href={backHref} className="text-sm font-medium text-primary underline-offset-2 hover:underline">
          Volver
        </Link>
      </div>
    );
  }

  if (enabled) {
    return (
      <div className="space-y-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="h-5 w-5 text-success" /> Activa. Al ingresar se te pide el código de la app.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="totp-code">Para desactivarla, escribí el código que muestra ahora la app</Label>
          <CodeInput value={code} onChange={setCode} />
        </div>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          variant="outline"
          className="h-11 w-full"
          disabled={pending || code.replace(/\s/g, "").length !== 6}
          onClick={() =>
            run(async () => {
              const r = await disableTwoFactor(code);
              if (!r.ok) return setError(r.error);
              setDone("Se desactivó la verificación en dos pasos.");
              router.refresh();
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Desactivar
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <div className="space-y-4">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
          <li>Instalá en el celular Google Authenticator, Microsoft Authenticator o similar.</li>
          <li>Tocá «Activar» y escaneá el código QR con la app.</li>
          <li>Escribí el código de 6 dígitos que aparece en la app para confirmar.</li>
        </ol>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <Button
          type="button"
          className="h-11 w-full"
          disabled={pending}
          onClick={() =>
            run(async () => {
              const r = await startTwoFactorSetup();
              if (!r.ok) return setError(r.error);
              setSetup({ secret: r.secret, qr: r.qr });
            })
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Activar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={setup.qr} alt="Código QR para la app de autenticación" width={220} height={220} className="rounded-md border border-border bg-white p-2" />
        <p className="text-center text-xs text-muted-foreground">
          ¿No podés escanear? Cargá esta clave a mano en la app:
          <br />
          <code className="select-all break-all text-sm font-semibold text-foreground">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
        </p>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="totp-code">Código que muestra la app</Label>
        <CodeInput value={code} onChange={setCode} />
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button
        type="button"
        className="h-11 w-full"
        disabled={pending || code.replace(/\s/g, "").length !== 6}
        onClick={() =>
          run(async () => {
            const r = await confirmTwoFactor(code);
            if (!r.ok) return setError(r.error);
            setDone("Listo: la verificación en dos pasos quedó activa. La próxima vez que ingreses te va a pedir el código.");
            router.refresh();
          })
        }
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Confirmar y activar
      </Button>
    </div>
  );
}
