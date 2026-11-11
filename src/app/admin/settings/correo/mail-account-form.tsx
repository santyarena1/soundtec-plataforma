"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PlugZap, XCircle } from "lucide-react";
import { toast } from "sonner";
import { saveMailAccountAction, testMailAccountAction } from "@/server/actions/mail-account";

type Account = { host: string; user: string; fromName: string; smtpPort: number; imapPort: number; hasPassword: boolean };

const field = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60";
const label = "mb-1.5 block text-sm font-medium";

export function MailAccountForm({ initial }: { initial: Account }) {
  const [form, setForm] = useState({ ...initial, user: initial.user || "comercial@soundtec.com.ar", password: "" });
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [test, setTest] = useState<{ smtp: string | null; imap: string | null } | null>(null);
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = () =>
    startSave(async () => {
      const result = await saveMailAccountAction(form);
      if (!result.ok) return void toast.error(result.error);
      if (form.password) setHasPassword(true);
      set({ password: "" });
      setTest(null);
      toast.success("Cuenta guardada.");
    });

  const runTest = () =>
    startTest(async () => {
      const result = await testMailAccountAction();
      if (!result.ok) return void toast.error(result.error);
      setTest({ smtp: result.smtp, imap: result.imap });
    });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold">Cuenta que manda las invitaciones</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Las invitaciones de los formularios salen desde esta casilla, con su firma, y quedan en su carpeta Enviados. Las respuestas por mail y los rebotes se leen de su bandeja de entrada.
        </p>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <div>
            <label className={label} htmlFor="mail-user">Mail</label>
            <input id="mail-user" autoComplete="off" value={form.user} onChange={(e) => set({ user: e.target.value })} className={field} placeholder="comercial@soundtec.com.ar" />
          </div>
          <div>
            <label className={label} htmlFor="mail-password">Contraseña</label>
            <input
              id="mail-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => set({ password: e.target.value })}
              className={field}
              placeholder={hasPassword ? "Guardada (escribí otra para cambiarla)" : "La de la casilla"}
            />
            <p className="mt-1 text-xs text-muted-foreground">Se guarda cifrada. Nadie la puede volver a ver, ni desde esta pantalla.</p>
          </div>
          <div>
            <label className={label} htmlFor="mail-from">Nombre que ve quien recibe</label>
            <input id="mail-from" autoComplete="off" value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} className={field} placeholder="Soundtec" />
          </div>
          <div>
            <label className={label} htmlFor="mail-host">Servidor</label>
            <input id="mail-host" autoComplete="off" value={form.host} onChange={(e) => set({ host: e.target.value })} className={field} />
            <p className="mt-1 text-xs text-muted-foreground">El correo de soundtec.com.ar está en InMotion: queda como viene.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="mail-smtp">Puerto de envío</label>
              <input id="mail-smtp" inputMode="numeric" autoComplete="off" value={form.smtpPort} onChange={(e) => set({ smtpPort: Number(e.target.value) || 0 })} className={field} />
            </div>
            <div>
              <label className={label} htmlFor="mail-imap">Puerto de lectura</label>
              <input id="mail-imap" inputMode="numeric" autoComplete="off" value={form.imapPort} onChange={(e) => set({ imapPort: Number(e.target.value) || 0 })} className={field} />
            </div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
          </button>
          <button type="button" onClick={runTest} disabled={testing || !hasPassword} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
            {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Probar conexión
          </button>
        </div>
        {test ? (
          <ul className="mt-4 space-y-1.5 text-sm">
            <TestRow ok={!test.smtp} label="Envío (SMTP)" error={test.smtp} />
            <TestRow ok={!test.imap} label="Lectura de la bandeja (IMAP)" error={test.imap} />
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function TestRow({ ok, label: text, error }: { ok: boolean; label: string; error: string | null }) {
  return (
    <li className={`flex items-start gap-2 ${ok ? "text-emerald-700" : "text-destructive"}`}>
      {ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0" />}
      <span>
        <b>{text}:</b> {ok ? "conecta bien." : error}
      </span>
    </li>
  );
}
