"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toWhatsAppNumber } from "@/lib/expo/whatsapp";
import { approveAccountRequest, regenerateActivationLink, rejectAccountRequest } from "@/server/actions/account-requests";

type LinkState = { url: string; title: string; note?: string };

/** Link de activación con copiar / WhatsApp. "Listo" refresca la lista. */
function ActivationLinkPanel({ link, phone, name, onDone }: { link: LinkState; phone: string; name: string; onDone: () => void }) {
  const number = toWhatsAppNumber(phone);
  const wa = `https://wa.me/${number}?text=${encodeURIComponent(
    `Hola ${name}, tu cuenta de Soundtec está aprobada. Creá tu contraseña acá: ${link.url}`
  )}`;
  return (
    <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3 text-xs">
      <p className="font-semibold text-emerald-800">{link.title}</p>
      {link.note ? <p className="text-emerald-800">{link.note}</p> : null}
      <Input readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(link.url)}>Copiar</Button>
        {number ? (
          <a href={wa} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white">
            Enviar por WhatsApp
          </a>
        ) : null}
        <Button size="sm" variant="ghost" onClick={onDone}>Listo</Button>
      </div>
    </div>
  );
}

export function RequestActions({ id, phone, name }: { id: string; phone: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState | null>(null);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  // No se refresca acá: el link tiene que quedar visible hasta que el admin toque "Listo".
  const approve = () =>
    start(async () => {
      const r = await approveAccountRequest(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setLink({
        url: r.activationUrl,
        title: `Aprobada. ${r.mailSent ? "Le enviamos el mail." : "Mandale el link de activación (vence en 72 h):"}`,
        note: r.linkedExistingClient ? `Se vinculó al cliente existente ${r.clientName}` : undefined,
      });
    });
  const reject = () =>
    start(async () => {
      const r = await rejectAccountRequest(id, reason);
      if (!r.ok) return setError(r.error ?? "Error");
      router.refresh();
    });

  if (link) return <ActivationLinkPanel link={link} phone={phone} name={name} onDone={() => router.refresh()} />;

  return (
    <div className="space-y-2">
      {rejecting ? (
        <div className="flex gap-2">
          <Input placeholder="Motivo del rechazo" value={reason} onChange={(e) => setReason(e.target.value)} />
          <Button size="sm" variant="destructive" onClick={reject} disabled={pending}>Rechazar</Button>
          <Button size="sm" variant="ghost" onClick={() => setRejecting(false)}>Cancelar</Button>
        </div>
      ) : (
        <div className="flex gap-2">
          <Button size="sm" onClick={approve} disabled={pending}>{pending ? "Aprobando…" : "Aprobar"}</Button>
          <Button size="sm" variant="outline" onClick={() => setRejecting(true)} disabled={pending}>Rechazar</Button>
        </div>
      )}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

/** Para solicitudes aprobadas: generar un link nuevo si el anterior se perdió o venció. */
export function RegenerateLinkAction({ id, phone, name }: { id: string; phone: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<LinkState | null>(null);

  const regenerate = () =>
    start(async () => {
      const r = await regenerateActivationLink(id);
      if (!r.ok) return setError(r.error);
      setError(null);
      setLink({ url: r.activationUrl, title: "Link nuevo (vence en 72 h). Los anteriores dejan de funcionar." });
    });

  if (link) return <ActivationLinkPanel link={link} phone={phone} name={name} onDone={() => { setLink(null); router.refresh(); }} />;

  return (
    <div className="space-y-2">
      <Button size="sm" variant="outline" onClick={regenerate} disabled={pending}>
        {pending ? "Generando…" : "Generar link de activación"}
      </Button>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
