"use client";
import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
export function PasswordReveal({ password }: { password: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(password);
    setCopied(true);
  }
  return (
    <div className="rounded-lg border border-warning/30 bg-warning/5 p-4">
      <p className="text-sm font-medium">Contraseña temporal</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Copiala ahora: por seguridad se muestra una sola vez.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <code className="flex-1 rounded bg-background px-3 py-2 text-sm">{password}</code>
        <Button size="sm" variant="outline" onClick={copy}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copiada" : "Copiar"}
        </Button>
      </div>
    </div>
  );
}
