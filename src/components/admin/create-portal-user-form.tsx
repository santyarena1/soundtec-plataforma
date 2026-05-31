"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { createPortalUser } from "@/server/actions/clients";

interface Props {
  clientId: string;
  onCreated?: () => void;
}

export function CreatePortalUserForm({ clientId, onCreated }: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pending, start] = useTransition();

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await createPortalUser(fd);
      if (r.ok) {
        setSuccess(true);
        setOpen(false);
        onCreated?.();
        (e.target as HTMLFormElement).reset();
      } else {
        setError(r.error || "Error al crear usuario");
      }
    });
  }

  if (!open) {
    return (
      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}>
          + Crear usuario de portal
        </Button>
        {success && <span className="text-sm text-success">Usuario creado correctamente.</span>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border border-border bg-muted/30 p-4 space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      <p className="text-sm font-medium">Nuevo usuario de portal</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="pu-name" required>Nombre</Label>
          <Input id="pu-name" name="name" required minLength={2} maxLength={120} />
        </div>
        <div>
          <Label htmlFor="pu-email" required>Email</Label>
          <Input id="pu-email" name="email" type="email" required />
        </div>
        <div>
          <Label htmlFor="pu-password" required>Contraseña (mín. 8 caracteres)</Label>
          <Input id="pu-password" name="password" type="password" required minLength={8} maxLength={120} />
        </div>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Crear usuario
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}
