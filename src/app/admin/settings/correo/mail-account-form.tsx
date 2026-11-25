"use client";

import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, PlugZap, Send, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { saveMailAccountAction, sendTestMailAction, testMailAccountAction } from "@/server/actions/mail-account";

type Account = { host: string; user: string; fromName: string; replyTo: string; smtpPort: number; imapPort: number; hasPassword: boolean };

export const field = "h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60";
export const label = "mb-1.5 block text-sm font-medium";
const hint = "mt-1 text-xs text-muted-foreground";

export function MailAccountForm({ initial }: { initial: Account }) {
  const [form, setForm] = useState({ ...initial, password: "" });
  const [hasPassword, setHasPassword] = useState(initial.hasPassword);
  const [test, setTest] = useState<{ smtp: string | null; imap: string | null } | null>(null);
  const [testTo, setTestTo] = useState("");
  const [saving, startSave] = useTransition();
  const [testing, startTest] = useTransition();
  const [mailing, startMail] = useTransition();
  const set = (patch: Partial<typeof form>) => setForm((prev) => ({ ...prev, ...patch }));
  const { markSaved, isDirty } = useUnsavedValue(form);

  const save = () =>
    startSave(async () => {
      const result = await saveMailAccountAction(form);
      if (!result.ok) return void toast.error(result.error);
      if (form.password) setHasPassword(true);
      set({ password: "" });
      markSaved({ ...form, password: "" });
      setTest(null);
      toast.success("Casilla guardada.");
    });

  const runTest = () =>
    startTest(async () => {
      const result = await testMailAccountAction();
      if (!result.ok) return void toast.error(result.error);
      setTest({ smtp: result.smtp, imap: result.imap });
    });

  const sendTest = () =>
    startMail(async () => {
      const result = await sendTestMailAction({ to: testTo });
      if (!result.ok) return void toast.error(result.error);
      if (result.status === "SENT") toast.success(`Listo: mandamos la prueba a ${result.to}. Fijate que llegue (y que no caiga en spam).`);
      else toast.error(`No salió la prueba: ${result.error ?? "revisá la casilla"}. Quedó en «Últimos envíos».`);
    });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">Casilla con la que sale todo</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
        Invitaciones al portal, cuentas aprobadas, «Olvidé mi clave», avisos al equipo y las invitaciones de Formularios salen desde esta casilla y con su firma. El dominio soundtec.com.ar exige que el remitente sea la misma casilla con la que se entra al servidor: por eso no se puede poner otro «De».
      </p>
      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="mail-user">Casilla (manda y recibe las respuestas)</label>
          <input id="mail-user" autoComplete="off" value={form.user} onChange={(e) => set({ user: e.target.value })} className={field} placeholder="portal@soundtec.com.ar" />
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
          <p className={hint}>Se guarda cifrada. Nadie la puede volver a ver, ni desde esta pantalla.</p>
        </div>
        <div>
          <label className={label} htmlFor="mail-from">Nombre que ve quien recibe</label>
          <input id="mail-from" autoComplete="off" value={form.fromName} onChange={(e) => set({ fromName: e.target.value })} className={field} placeholder="Soundtec Portal" />
        </div>
        <div>
          <label className={label} htmlFor="mail-reply">Las respuestas van a (opcional)</label>
          <input id="mail-reply" autoComplete="off" value={form.replyTo} onChange={(e) => set({ replyTo: e.target.value })} className={field} placeholder="Vacío = vuelven a la casilla de arriba" />
          <p className={hint}>Por ejemplo comercial@soundtec.com.ar, para que lo que contesten los clientes le llegue al equipo comercial.</p>
        </div>
        <div>
          <label className={label} htmlFor="mail-host">Servidor</label>
          <input id="mail-host" autoComplete="off" value={form.host} onChange={(e) => set({ host: e.target.value })} className={field} />
          <p className={hint}>El correo de soundtec.com.ar está en InMotion: queda como viene.</p>
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
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={saving} className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
        </button>
        <button type="button" onClick={runTest} disabled={testing || !hasPassword || isDirty} title={isDirty ? "Guardá primero los cambios" : undefined} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
          {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlugZap className="h-4 w-4" />} Probar conexión
        </button>
        <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
        <input aria-label="Mail para la prueba" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="A mi mail" className={`${field.replace("w-full", "")} w-56`} />
        <button type="button" onClick={sendTest} disabled={mailing || isDirty} title={isDirty ? "Guardá primero los cambios" : undefined} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
          {mailing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Mandarme un mail de prueba
        </button>
      </div>
      {test ? (
        <ul className="mt-4 space-y-1.5 text-sm">
          <TestRow ok={!test.smtp} label="Envío (SMTP)" error={test.smtp} />
          <TestRow ok={!test.imap} label="Lectura de la bandeja (IMAP)" error={test.imap} />
        </ul>
      ) : null}
    </section>
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
