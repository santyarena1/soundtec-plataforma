"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CheckCircle2, Copy, Globe, KeyRound, Loader2, RefreshCw, Save, Send, ShieldCheck, XCircle } from "lucide-react";
import { toast } from "sonner";
import { useUnsavedChangesGuard, useUnsavedValue } from "@/hooks/use-unsaved-changes-guard";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { cn } from "@/lib/utils";
import type { CampaignFooter } from "@/lib/mailing/template";
import {
  checkDomainAction,
  createDomainAction,
  enableTrackingAction,
  saveMailingConfigAction,
  saveMailingSecretsAction,
  sendConfigTestAction,
  verifyDomainAction,
  type DomainStatus,
} from "@/server/actions/mailing-settings";

type Summary = {
  from: string;
  replyTo: string;
  footer: CampaignFooter;
  dailyLimit: number;
  batchSize: number;
  simulate: boolean;
  forcedSimulate: boolean;
  domain: string;
  apiKeySource: "env" | "setting" | "none";
  apiKeyMasked: string;
  webhookSecretSource: "env" | "setting" | "none";
  webhookSecretMasked: string;
};

const card = "space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm";

function SourceBadge({ source, masked }: { source: "env" | "setting" | "none"; masked: string }) {
  if (source === "none") return <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-800"><XCircle className="h-3.5 w-3.5" /> Sin cargar</span>;
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
      <CheckCircle2 className="h-3.5 w-3.5" /> {masked} · {source === "env" ? "en Vercel" : "guardada acá (cifrada)"}
    </span>
  );
}

export function MailingConfigForm({ summary, canEditKeys, webhookUrl, defaultTestEmail }: { summary: Summary; canEditKeys: boolean; webhookUrl: string; defaultTestEmail: string }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [form, setForm] = useState({
    from: summary.from,
    replyTo: summary.replyTo,
    footerCompany: summary.footer.company,
    footerAddress: summary.footer.address,
    footerReason: summary.footer.reason,
    dailyLimit: summary.dailyLimit,
    batchSize: summary.batchSize,
    simulate: summary.forcedSimulate,
    domain: summary.domain,
  });
  const [apiKey, setApiKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [testTo, setTestTo] = useState(defaultTestEmail);
  const [domain, setDomain] = useState<DomainStatus | null>(null);

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  // Aviso al salir: configuración distinta de la guardada, o una clave escrita sin guardar.
  const { markSaved } = useUnsavedValue(form);
  useUnsavedChangesGuard(Boolean(apiKey.trim() || webhookSecret.trim()), "Escribiste una clave y no la guardaste.");

  function saveConfig() {
    start(async () => {
      const result = await saveMailingConfigAction(form);
      if (!result.ok) return void toast.error(result.error);
      markSaved(form);
      toast.success("Configuración guardada.");
      router.refresh();
    });
  }

  function saveSecrets(input: { apiKey?: string; webhookSecret?: string }) {
    start(async () => {
      const result = await saveMailingSecretsAction(input);
      if (!result.ok) return void toast.error(result.error);
      toast.success("Guardada (cifrada).");
      setApiKey("");
      setWebhookSecret("");
      router.refresh();
    });
  }

  function checkDomain() {
    start(async () => {
      const result = await checkDomainAction();
      if (!result.ok) return void toast.error(result.error);
      setDomain(result.status);
    });
  }

  const domainAction = (fn: () => Promise<{ ok: boolean; error?: string }>, message: string) =>
    start(async () => {
      const result = await fn();
      if (!result.ok) return void toast.error(result.error ?? "No se pudo.");
      toast.success(message);
      const refreshed = await checkDomainAction();
      if (refreshed.ok) setDomain(refreshed.status);
    });

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <div className="space-y-5">
        <section className={card}>
          <h2 className="flex items-center gap-2 font-semibold">
            <KeyRound className="h-4 w-4 text-primary" /> Cuenta de Resend
          </h2>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label>API key</Label>
              <SourceBadge source={summary.apiKeySource} masked={summary.apiKeyMasked} />
            </div>
            {summary.apiKeySource === "env" ? (
              <p className="text-xs text-muted-foreground">Está en las variables de Vercel (RESEND_API_KEY): se cambia allá.</p>
            ) : canEditKeys ? (
              <div className="flex gap-2">
                <PasswordInput value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="re_…" autoComplete="off" />
                <Button variant="outline" disabled={busy || !apiKey.trim()} onClick={() => saveSecrets({ apiKey })}>
                  <Save className="h-4 w-4" /> Guardar
                </Button>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">La carga un administrador.</p>
            )}
            <p className="text-xs text-muted-foreground">Es la misma clave que usan los avisos del sistema (altas de cuenta, contraseñas). Conviene una con «Full access» para poder ver el dominio desde acá.</p>
          </div>
          <div className="space-y-1.5 border-t border-border pt-4">
            <div className="flex items-center justify-between gap-2">
              <Label>Webhook (entregas, aperturas, clics, rebotes, spam)</Label>
              <SourceBadge source={summary.webhookSecretSource} masked={summary.webhookSecretMasked} />
            </div>
            <p className="text-xs text-muted-foreground">En resend.com › Webhooks › Add endpoint, pegá esta dirección y marcá todos los eventos de email:</p>
            <div className="flex gap-2">
              <Input readOnly value={webhookUrl} className="font-mono text-xs" aria-label="URL del webhook" />
              <Button
                variant="outline"
                onClick={() => {
                  void navigator.clipboard.writeText(webhookUrl);
                  toast.success("Copiada.");
                }}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            {summary.webhookSecretSource !== "env" && canEditKeys ? (
              <div className="flex gap-2">
                <PasswordInput value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder="Signing secret: whsec_…" autoComplete="off" />
                <Button variant="outline" disabled={busy || !webhookSecret.trim()} onClick={() => saveSecrets({ webhookSecret })}>
                  <Save className="h-4 w-4" /> Guardar
                </Button>
              </div>
            ) : summary.webhookSecretSource === "env" ? (
              <p className="text-xs text-muted-foreground">El secreto está en Vercel (RESEND_WEBHOOK_SECRET).</p>
            ) : null}
          </div>
        </section>

        <section className={card}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-semibold">
              <Globe className="h-4 w-4 text-primary" /> Dominio {summary.domain}
            </h2>
            <Button variant="outline" size="sm" disabled={busy} onClick={checkDomain}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Revisar
            </Button>
          </div>
          <DomainPanel status={domain} canEditKeys={canEditKeys} busy={busy} onVerify={(id) => domainAction(() => verifyDomainAction({ id }), "Resend lo está verificando: puede tardar unos minutos.")} onTracking={(id) => domainAction(() => enableTrackingAction({ id }), "Seguimiento de aperturas y clics activado.")} onCreate={() => domainAction(() => createDomainAction(), "Dominio agregado en Resend: ahora cargá los registros DNS.")} />
        </section>
      </div>

      <div className="space-y-5">
        <section className={card}>
          <h2 className="font-semibold">Remitente y pie</h2>
          <div className="space-y-1.5">
            <Label required>De</Label>
            <Input value={form.from} onChange={(e) => set({ from: e.target.value })} placeholder="Soundtec <noreply@soundtecportal.com.ar>" />
            <p className="text-xs text-muted-foreground">Tiene que ser una dirección del dominio verificado ({summary.domain}).</p>
          </div>
          <div className="space-y-1.5">
            <Label>Las respuestas van a</Label>
            <Input value={form.replyTo} onChange={(e) => set({ replyTo: e.target.value })} placeholder="comercial@soundtec.com.ar" />
            <p className="text-xs text-muted-foreground">Si alguien responde la promo, le llega a esta casilla (la de noreply no la lee nadie).</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label required>Razón social</Label>
              <Input value={form.footerCompany} onChange={(e) => set({ footerCompany: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Dirección postal</Label>
              <Input value={form.footerAddress} onChange={(e) => set({ footerAddress: e.target.value })} placeholder="Calle 123, CABA, Argentina" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Por qué le llega</Label>
            <Textarea rows={2} value={form.footerReason} onChange={(e) => set({ footerReason: e.target.value })} />
          </div>
          {!form.footerAddress.trim() ? <p className="text-xs text-amber-800">Falta la dirección postal: Gmail y Yahoo la piden en envíos masivos y ayuda a no caer en spam.</p> : null}
        </section>

        <section className={card}>
          <h2 className="flex items-center gap-2 font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" /> Ritmo de envío
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Máximo por día</Label>
              <Input type="number" min={0} value={form.dailyLimit} onChange={(e) => set({ dailyLimit: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">Dominio nuevo: arrancá en 200-300 y subí de a poco (duplicando cada semana si los rebotes quedan bajos). 0 = sin límite.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Mails por tanda</Label>
              <Input type="number" min={1} max={100} value={form.batchSize} onChange={(e) => set({ batchSize: Number(e.target.value) })} />
              <p className="text-xs text-muted-foreground">Hasta 100 (lo que acepta Resend por llamada).</p>
            </div>
          </div>
          <label className={cn("flex cursor-pointer items-start gap-3 rounded-lg border p-3", form.simulate ? "border-amber-300 bg-amber-50" : "border-border")}>
            <input type="checkbox" className="mt-1" checked={form.simulate} onChange={(e) => set({ simulate: e.target.checked })} />
            <span>
              <span className="block text-sm font-semibold">Solo simular</span>
              <span className="block text-xs text-muted-foreground">Los envíos se registran como simulados y no sale nada, aunque haya API key. Sirve para probar listas y el armado.</span>
            </span>
          </label>
          <div className="space-y-1.5">
            <Label>Dominio de envío</Label>
            <Input value={form.domain} onChange={(e) => set({ domain: e.target.value })} />
          </div>
          <Button disabled={busy} onClick={saveConfig}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
          </Button>
        </section>

        <section className={card}>
          <h2 className="font-semibold">Mandar una prueba</h2>
          <p className="text-sm text-muted-foreground">Un mail de ejemplo con el remitente y el pie de arriba (guardá antes los cambios).</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} aria-label="Mail para la prueba" />
            <Button
              variant="outline"
              disabled={busy || !testTo.trim()}
              onClick={() =>
                start(async () => {
                  const result = await sendConfigTestAction({ to: testTo });
                  if (!result.ok) return void toast.error(result.error);
                  toast.success(result.simulated ? "Modo prueba: no salió nada." : `Enviada a ${testTo}.`);
                })
              }
            >
              <Send className="h-4 w-4" /> Enviar prueba
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}

function DomainPanel({
  status,
  canEditKeys,
  busy,
  onVerify,
  onTracking,
  onCreate,
}: {
  status: DomainStatus | null;
  canEditKeys: boolean;
  busy: boolean;
  onVerify: (id: string) => void;
  onTracking: (id: string) => void;
  onCreate: () => void;
}) {
  if (!status) return <p className="text-sm text-muted-foreground">Tocá «Revisar» para ver si el dominio está verificado en Resend y qué registros DNS pide.</p>;
  if (status.state === "no_key") return <p className="text-sm text-muted-foreground">Primero cargá la API key de Resend.</p>;
  if (status.state === "error") return <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">{status.error}</p>;
  if (status.state === "missing")
    return (
      <div className="space-y-2 text-sm">
        <p>
          El dominio <b>{status.domain}</b> no está en la cuenta de Resend{status.others.length ? ` (están: ${status.others.join(", ")})` : ""}.
        </p>
        {canEditKeys ? (
          <Button size="sm" disabled={busy} onClick={onCreate}>
            Agregarlo en Resend
          </Button>
        ) : null}
      </div>
    );
  const verified = status.status === "verified";
  return (
    <div className="space-y-3 text-sm">
      <p className={cn("flex items-center gap-2 font-semibold", verified ? "text-emerald-700" : "text-amber-800")}>
        {verified ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        {verified ? "Verificado: los mails salen firmados por soundtecportal.com.ar" : `Sin verificar (estado: ${status.status})`}
        {status.region ? <span className="font-normal text-muted-foreground">· región {status.region}</span> : null}
      </p>
      {!verified ? (
        <p className="text-xs text-muted-foreground">
          Cargá estos registros en Vercel › Domains › {status.domain} › DNS Records (en «Name» va tal cual lo que dice acá, sin agregar el dominio). Después tocá «Verificar»: los DNS pueden tardar de minutos a unas horas.
        </p>
      ) : null}
      {status.records.length ? (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-secondary/60 text-left">
                <th className="px-2 py-1.5">Tipo</th>
                <th className="px-2 py-1.5">Name</th>
                <th className="px-2 py-1.5">Valor</th>
                <th className="px-2 py-1.5">Prioridad</th>
                <th className="px-2 py-1.5">Estado</th>
              </tr>
            </thead>
            <tbody>
              {status.records.map((r, i) => (
                <tr key={i} className="border-t border-border/60 align-top">
                  <td className="px-2 py-1.5 font-semibold">{r.type}</td>
                  <td className="px-2 py-1.5 font-mono">{r.name}</td>
                  <td className="max-w-[280px] break-all px-2 py-1.5 font-mono">{r.value}</td>
                  <td className="px-2 py-1.5">{r.priority ?? ""}</td>
                  <td className={cn("px-2 py-1.5", r.status === "verified" ? "text-emerald-700" : "text-amber-800")}>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        {!verified ? (
          <Button size="sm" disabled={busy} onClick={() => onVerify(status.id)}>
            Verificar
          </Button>
        ) : null}
        {status.openTracking === false || status.clickTracking === false ? (
          canEditKeys ? (
            <Button size="sm" variant="outline" disabled={busy} onClick={() => onTracking(status.id)}>
              Activar seguimiento de aperturas y clics
            </Button>
          ) : (
            <span className="text-xs text-amber-800">El seguimiento de aperturas y clics está apagado.</span>
          )
        ) : status.openTracking ? (
          <span className="text-xs text-emerald-700">Seguimiento de aperturas y clics activo.</span>
        ) : null}
      </div>
    </div>
  );
}
