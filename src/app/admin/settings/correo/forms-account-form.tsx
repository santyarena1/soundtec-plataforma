"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { saveFormsMailAccountAction } from "@/server/actions/mail-account";
import { field, label } from "./mail-account-form";

type FormsAccount = { user: string; fromName: string; hasPassword: boolean };

/** Casilla propia de Formularios: opcional. Vacía = las invitaciones salen por la del portal. */
export function FormsAccountForm({ initial, portalUser }: { initial: FormsAccount; portalUser: string }) {
  const [form, setForm] = useState({ user: initial.user, fromName: initial.fromName, password: "" });
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [saving, start] = useTransition();
  const { markSaved } = useUnsavedValue(form);
  const own = Boolean(initial.user && initial.hasPassword);

  const save = () =>
    start(async () => {
      const result = await saveFormsMailAccountAction(form);
      if (!result.ok) return void toast.error(result.error);
      const next = { ...form, password: "" };
      setHasPassword(form.user ? hasPassword || Boolean(form.password) : false);
      setForm(next);
      markSaved(next);
      toast.success(form.user ? "Formularios usa su propia casilla." : "Formularios vuelve a usar la casilla del portal.");
    });

  return (
    <details className="group rounded-xl border border-border bg-card shadow-sm" open={own}>
      <summary className="cursor-pointer list-none p-5">
        <h2 className="text-base font-semibold">Formularios</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {own ? (
            <>Las invitaciones de Formularios salen desde <b className="text-foreground">{initial.user}</b> (casilla propia).</>
          ) : (
            <>Las invitaciones de Formularios salen desde la casilla del portal{portalUser ? <> (<b className="text-foreground">{portalUser}</b>)</> : null}. Tocá acá si querés que salgan desde otra.</>
          )}
        </p>
      </summary>
      <div className="grid gap-4 border-t border-border p-5 sm:grid-cols-3">
        <div>
          <label className={label} htmlFor="forms-user">Casilla propia</label>
          <input id="forms-user" autoComplete="off" value={form.user} onChange={(e) => setForm({ ...form, user: e.target.value })} className={field} placeholder="Vacío = la del portal" />
        </div>
        <div>
          <label className={label} htmlFor="forms-password">Contraseña</label>
          <input
            id="forms-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className={field}
            placeholder={hasPassword ? "Guardada (escribí otra para cambiarla)" : "La de esa casilla"}
          />
        </div>
        <div>
          <label className={label} htmlFor="forms-from">Nombre visible</label>
          <input id="forms-from" autoComplete="off" value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} className={field} placeholder="Soundtec" />
        </div>
        <p className="text-xs text-muted-foreground sm:col-span-3">Usa el mismo servidor y puertos que la casilla del portal. Las respuestas y rebotes de las invitaciones se leen de la casilla con la que salieron.</p>
        <div className="sm:col-span-3">
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
          </button>
        </div>
      </div>
    </details>
  );
}
