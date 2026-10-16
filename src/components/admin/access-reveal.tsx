"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Mail, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AccessResult, AccessMode } from "@/server/user-access";

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={async () => {
        await navigator.clipboard.writeText(value);
        setCopied(true);
      }}
    >
      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
      {copied ? "Copiado" : "Copiar"}
    </Button>
  );
}

/** Lo que hay que pasarle al usuario: el link de invitación o la clave temporal. Se muestra una sola vez. */
export function AccessReveal({ access, email, name }: { access: AccessResult; email: string; name?: string }) {
  if (access.mode === "invite") {
    const whatsapp = `https://wa.me/?text=${encodeURIComponent(`Hola${name ? ` ${name}` : ""}, te dimos acceso a Soundtec. Creá tu clave desde este link (vence en 72 h): ${access.activationUrl}`)}`;
    return (
      <div className="space-y-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
        <p className="flex items-center gap-2 text-sm font-medium">
          <Mail className="h-4 w-4" />
          {access.mailSent ? `Le mandamos la invitación a ${email}.` : `No se pudo mandar el mail a ${email}: pasale el link vos.`}
        </p>
        <p className="text-xs text-muted-foreground">Con este link crea su propia clave. Vence en 72 horas y sirve una sola vez.</p>
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded bg-background px-3 py-2 text-xs">{access.activationUrl}</code>
          <CopyButton value={access.activationUrl} />
        </div>
        <a href={whatsapp} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
          <MessageCircle className="h-3.5 w-3.5" /> Mandar el link por WhatsApp
        </a>
      </div>
    );
  }
  return (
    <div className="space-y-3 rounded-lg border border-warning/30 bg-warning/5 p-4">
      <p className="flex items-center gap-2 text-sm font-medium">
        <KeyRound className="h-4 w-4" /> Clave temporal de {email}
      </p>
      <p className="text-xs text-muted-foreground">
        Copiala ahora: se muestra una sola vez. Al entrar por primera vez le vamos a pedir que elija una propia.
      </p>
      <div className="flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-3 py-2 font-mono text-sm tracking-wide">{access.password}</code>
        <CopyButton value={access.password} />
      </div>
    </div>
  );
}

/** Cómo recibe el acceso: invitación por mail (recomendado) o clave temporal. */
export function AccessModePicker({ value, onChange }: { value: AccessMode; onChange: (mode: AccessMode) => void }) {
  const options: Array<[AccessMode, string, string]> = [
    ["invite", "Invitación por mail", "Le llega un link para crear su clave. Nadie más la conoce. (Recomendado)"],
    ["temporary", "Clave temporal", "Generamos una clave segura para que se la pases; al entrar elige una propia."],
  ];
  return (
    <fieldset>
      <legend className="text-sm font-medium">Cómo recibe el acceso</legend>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        {options.map(([mode, label, help]) => (
          <label key={mode} className={`cursor-pointer rounded-lg border p-3 text-sm transition-colors ${value === mode ? "border-primary bg-primary/5" : "hover:bg-secondary/50"}`}>
            <input className="mr-2" type="radio" name="accessModeChoice" checked={value === mode} onChange={() => onChange(mode)} />
            <span className="font-medium">{label}</span>
            <span className="mt-1 block text-xs text-muted-foreground">{help}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
