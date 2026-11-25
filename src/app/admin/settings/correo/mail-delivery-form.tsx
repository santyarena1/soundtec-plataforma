"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { NOTICE_INFO, NOTICE_KINDS, OPTIONAL_CLIENT_KINDS, type NoticeKind } from "@/lib/mail/transactional/kinds";
import { saveMailDeliveryAction } from "@/server/actions/mail-account";
import { field, label } from "./mail-account-form";

type ClientToggle = keyof typeof OPTIONAL_CLIENT_KINDS;

type Delivery = {
  hourlyLimit: number;
  sentCopy: boolean;
  resendFallback: boolean;
  recipients: Record<NoticeKind, string>;
  clientToggles: Record<ClientToggle, boolean>;
};

export function MailDeliveryForm({ initial, resendAvailable, sentLastHour }: { initial: Delivery; resendAvailable: boolean; sentLastHour: number }) {
  const [form, setForm] = useState(initial);
  const [saving, start] = useTransition();
  const { markSaved } = useUnsavedValue(form);
  const set = (patch: Partial<Delivery>) => setForm((prev) => ({ ...prev, ...patch }));

  const save = () =>
    start(async () => {
      const result = await saveMailDeliveryAction(form);
      if (!result.ok) return void toast.error(result.error);
      markSaved(form);
      toast.success("Guardado.");
    });

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold">Cómo salen y a quién avisan</h2>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        <div className="space-y-4">
          <div>
            <label className={label} htmlFor="mail-limit">Tope de mails por hora</label>
            <input id="mail-limit" inputMode="numeric" value={form.hourlyLimit} onChange={(e) => set({ hourlyLimit: Number(e.target.value) || 0 })} className={`${field} w-32`} />
            <p className="mt-1 text-xs text-muted-foreground">
              InMotion limita los envíos por hora de cada casilla. Lo que pase el tope espera en cola y sale solo después. En la última hora salieron {sentLastHour}.
            </p>
          </div>
          <Check
            checked={form.sentCopy}
            onChange={(v) => set({ sentCopy: v })}
            title="Guardar copia en «Enviados» de la casilla"
            hint="Así quedan a mano desde el webmail. Los links para cambiar la clave nunca se copian."
          />
          <Check
            checked={form.resendFallback}
            disabled={!resendAvailable}
            onChange={(v) => set({ resendFallback: v })}
            title="Si la casilla falla o llega al tope, mandar por Resend"
            hint={resendAvailable ? "Respaldo: sale desde el dominio de Campañas, con Reply-To a la casilla del portal." : "Necesita la clave de Resend (Campañas › Configuración)."}
          />
          <div className="border-t border-border pt-4">
            <p className="text-sm font-medium">Mails a clientes que se pueden apagar</p>
            <p className="mt-1 text-xs text-muted-foreground">Invitaciones, cuenta aprobada y «Olvidé mi clave» salen siempre: son parte del acceso.</p>
            <div className="mt-3 space-y-3">
              {(Object.keys(OPTIONAL_CLIENT_KINDS) as ClientToggle[]).map((kind) => (
                <Check
                  key={kind}
                  checked={form.clientToggles[kind]}
                  onChange={(v) => set({ clientToggles: { ...form.clientToggles, [kind]: v } })}
                  title={OPTIONAL_CLIENT_KINDS[kind].label}
                  hint={OPTIONAL_CLIENT_KINDS[kind].hint}
                />
              ))}
            </div>
          </div>
        </div>

        <div>
          <p className="text-sm font-medium">Avisos al equipo</p>
          <p className="mt-1 text-xs text-muted-foreground">Mails separados por coma. Vacío = ese aviso no se manda.</p>
          <div className="mt-3 space-y-3">
            {NOTICE_KINDS.map((kind) => (
              <div key={kind}>
                <label className="mb-1 block text-sm" htmlFor={`notice-${kind}`}>
                  <span className="font-medium">{NOTICE_INFO[kind].label}</span> <span className="text-xs text-muted-foreground">· {NOTICE_INFO[kind].hint}</span>
                </label>
                <input
                  id={`notice-${kind}`}
                  autoComplete="off"
                  value={form.recipients[kind]}
                  onChange={(e) => set({ recipients: { ...form.recipients, [kind]: e.target.value } })}
                  className={field}
                  placeholder="ventas@soundtec.com.ar, nombre@soundtec.com.ar"
                />
              </div>
            ))}
          </div>
        </div>
      </div>

      <button type="button" onClick={save} disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Guardar
      </button>
    </section>
  );
}

function Check({ checked, onChange, title, hint, disabled }: { checked: boolean; onChange: (value: boolean) => void; title: string; hint: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <input type="checkbox" className="mt-1 h-4 w-4 accent-primary" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span>
        <span className="block text-sm font-medium">{title}</span>
        <span className="block text-xs text-muted-foreground">{hint}</span>
      </span>
    </label>
  );
}
