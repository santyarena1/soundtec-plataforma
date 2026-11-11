"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, BellRing, Download, FileSpreadsheet, Inbox, Loader2, Mail, Send, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { confirmDialog } from "@/components/ui/confirm-dialog";
import { updateForm } from "@/server/actions/forms";
import { renderInviteEmail } from "@/lib/forms/invite-email";
import type { InfoItem } from "@/lib/forms/types";
import { addInvitesText, checkInvitesInbox, importInvitesFile, removeInvites, sendInvitesBatch } from "@/server/actions/form-invites";

type Invite = {
  id: string;
  email: string;
  name: string;
  company: string;
  status: string;
  sentAt: string | null;
  openedAt: string | null;
  respondedAt: string | null;
  repliedAt: string | null;
  replySnippet: string;
  lastError: string;
};

type Filter = "all" | "waiting" | "done" | "problems";

/** Pausa entre tandas: el hosting limita cuántos mails salen por hora. */
const BATCH_PAUSE_MS = 4000;

const field = "w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-primary/60";

function shortDate(iso: string | null): string {
  if (!iso) return "";
  // Zona y formato fijos: el servidor (Vercel, en UTC) y el navegador tienen que mostrar lo mismo.
  return new Date(iso).toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}

/** Estado que se muestra: el más avanzado (respondió > abrió > enviado). */
function stage(i: Invite): { label: string; tone: string } {
  if (i.respondedAt) return { label: "Respondió", tone: "bg-emerald-100 text-emerald-800" };
  if (i.status === "BOUNCED") return { label: "Rebotó", tone: "bg-red-100 text-red-800" };
  if (i.status === "FAILED") return { label: "No salió", tone: "bg-red-100 text-red-800" };
  if (i.openedAt) return { label: "Abrió", tone: "bg-sky-100 text-sky-800" };
  if (i.status === "SENT") return { label: "Enviado", tone: "bg-slate-100 text-slate-700" };
  return { label: "Sin enviar", tone: "bg-amber-100 text-amber-900" };
}

export function InvitesManager({
  form,
  account,
  message,
  look,
  invites,
}: {
  form: { id: string; title: string; status: string };
  account: { user: string; ready: boolean };
  message: { subject: string; body: string; button: string };
  /** Cómo se ve el mail: título, datos del evento, color y encabezado. */
  look: { eventTitle: string; details: InfoItem[]; accent: "black" | "blue"; headerPath: string };
  invites: Invite[];
}) {
  const router = useRouter();
  const [draft, setDraft] = useState(message);
  const [pasted, setPasted] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selected, setSelected] = useState<string[]>([]);
  const [progress, setProgress] = useState<{ mode: "pending" | "reminder"; sent: number; total: number } | null>(null);
  const [busy, start] = useTransition();
  const fileRef = useRef<HTMLInputElement | null>(null);

  const counts = useMemo(() => {
    const c = { total: invites.length, pending: 0, sent: 0, opened: 0, responded: 0, problems: 0, waiting: 0 };
    for (const i of invites) {
      if (i.respondedAt) c.responded += 1;
      if (i.openedAt) c.opened += 1;
      if (i.status === "SENT") c.sent += 1;
      if (i.status === "PENDING" || i.status === "FAILED") c.pending += 1;
      if (i.status === "FAILED" || i.status === "BOUNCED") c.problems += 1;
      if (i.status === "SENT" && !i.respondedAt) c.waiting += 1;
    }
    return c;
  }, [invites]);

  const visible = invites.filter((i) =>
    filter === "waiting" ? i.status === "SENT" && !i.respondedAt : filter === "done" ? Boolean(i.respondedAt) : filter === "problems" ? i.status === "FAILED" || i.status === "BOUNCED" : true
  );
  const sample = invites[0] ?? { name: "Ana Gómez", company: "Estudio AV" };
  const preview = useMemo(
    () =>
      renderInviteEmail({
        formTitle: form.title,
        eventTitle: look.eventTitle,
        subject: draft.subject,
        message: draft.body,
        button: draft.button,
        url: "#",
        headerUrl: look.headerPath,
        details: look.details,
        accent: look.accent,
        invite: sample,
      }),
    [draft, form.title, look, sample]
  );
  const dirty = draft.subject !== message.subject || draft.body !== message.body || draft.button !== message.button;

  function saveMessage(after?: () => void) {
    start(async () => {
      const result = await updateForm({ formId: form.id, settings: { inviteSubject: draft.subject, inviteMessage: draft.body, inviteButton: draft.button } });
      if (!result.ok) return void toast.error(result.error);
      toast.success("Mail guardado.");
      after?.();
      router.refresh();
    });
  }

  function importFile(file: File) {
    start(async () => {
      const data = new FormData();
      data.set("formId", form.id);
      data.set("file", file);
      const result = await importInvitesFile(data);
      if (fileRef.current) fileRef.current.value = "";
      if (!result.ok) return void toast.error(result.error);
      toast.success(`${result.added} invitados nuevos${result.updated ? `, ${result.updated} completados` : ""}${result.skipped ? ` · ${result.skipped} filas sin mail válido o repetidas` : ""}.`);
      router.refresh();
    });
  }

  function addPasted() {
    start(async () => {
      const result = await addInvitesText({ formId: form.id, text: pasted });
      if (!result.ok) return void toast.error(result.error);
      setPasted("");
      toast.success(`${result.added} invitados nuevos.`);
      router.refresh();
    });
  }

  /** Manda en tandas hasta que no queda nadie, con pausa entre tandas. */
  async function send(mode: "pending" | "reminder") {
    const total = mode === "pending" ? counts.pending : counts.waiting;
    if (!total) return;
    const ok = await confirmDialog({
      message: mode === "pending" ? `¿Mandar la invitación a ${total} personas desde ${account.user}?` : `¿Mandar un recordatorio a las ${total} personas que todavía no respondieron?`,
      confirmLabel: mode === "pending" ? "Mandar" : "Mandar recordatorio",
    });
    if (!ok) return;
    if (dirty) {
      const saved = await updateForm({ formId: form.id, settings: { inviteSubject: draft.subject, inviteMessage: draft.body, inviteButton: draft.button } });
      if (!saved.ok) return void toast.error(saved.error);
    }
    const startedAt = new Date().toISOString();
    let sent = 0;
    let failed = 0;
    setProgress({ mode, sent: 0, total });
    for (;;) {
      const result = await sendInvitesBatch({ formId: form.id, mode, startedAt });
      if (!result.ok) {
        toast.error(result.error);
        break;
      }
      sent += result.sent;
      failed += result.failed;
      setProgress({ mode, sent, total });
      if (result.warning) {
        toast.error(result.warning);
        break;
      }
      if (result.remaining === 0 || result.sent + result.failed === 0) break;
      await new Promise((resolve) => setTimeout(resolve, BATCH_PAUSE_MS));
    }
    setProgress(null);
    if (sent) toast.success(`${sent} mails enviados${failed ? ` · ${failed} no salieron` : ""}.`);
    else if (failed) toast.error(`${failed} mails no salieron. Mirá el detalle en la lista.`);
    router.refresh();
  }

  function checkInbox() {
    start(async () => {
      const result = await checkInvitesInbox({ formId: form.id });
      if (!result.ok) return void toast.error(result.error);
      toast.success(`Casilla revisada: ${result.replies} respuestas por mail, ${result.bounces} rebotes.`);
      router.refresh();
    });
  }

  async function removeSelected() {
    const ok = await confirmDialog({ message: `¿Quitar ${selected.length} invitados de la lista?`, confirmLabel: "Quitar", tone: "danger" });
    if (!ok) return;
    start(async () => {
      const result = await removeInvites({ formId: form.id, ids: selected });
      if (!result.ok) return void toast.error(result.error);
      setSelected([]);
      router.refresh();
    });
  }

  function downloadCsv() {
    const rows = [["Nombre", "Email", "Empresa", "Estado", "Enviado", "Abrió", "Respondió", "Respuesta por mail"]];
    for (const i of invites) rows.push([i.name, i.email, i.company, stage(i).label, shortDate(i.sentAt), shortDate(i.openedAt), shortDate(i.respondedAt), i.replySnippet.replace(/\s+/g, " ")]);
    const csv = "﻿" + rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `invitados-${form.title.replace(/[^\w-]+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const sending = progress !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Invitados por mail</h1>
          <p className="text-sm text-muted-foreground">Cada persona recibe su propio enlace: así se sabe quién abrió y quién respondió.</p>
        </div>
        {account.ready ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-secondary px-3 py-1 text-xs text-muted-foreground">
            <Mail className="h-3.5 w-3.5" /> Sale desde <b className="text-foreground">{account.user}</b>
          </span>
        ) : null}
      </div>

      {!account.ready ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            Falta cargar la cuenta de mail que manda las invitaciones.{" "}
            <Link href="/admin/settings/correo" className="font-semibold underline">
              Configuración › Correo de envío
            </Link>
          </p>
        </div>
      ) : null}
      {form.status !== "OPEN" ? (
        <div className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>El formulario no está Abierto: pasalo a Abierto antes de mandar las invitaciones.</p>
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* El mail */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">El mail</h2>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="inv-subject">Asunto</label>
            <input id="inv-subject" autoComplete="off" maxLength={200} value={draft.subject} onChange={(e) => setDraft({ ...draft, subject: e.target.value })} className={`${field} h-10`} />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="inv-body">Texto</label>
            <textarea id="inv-body" rows={8} maxLength={5000} value={draft.body} onChange={(e) => setDraft({ ...draft, body: e.target.value })} className={`${field} py-2 leading-relaxed`} />
            <p className="mt-1 text-xs text-muted-foreground">
              <b>{"{nombre}"}</b> se cambia por el nombre de cada persona y <b>{"{empresa}"}</b> por su empresa. Abajo del texto va el botón con su enlace personal.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[12rem] flex-1">
              <label className="mb-1.5 block text-sm font-medium" htmlFor="inv-button">Texto del botón</label>
              <input id="inv-button" autoComplete="off" maxLength={60} value={draft.button} onChange={(e) => setDraft({ ...draft, button: e.target.value })} className={`${field} h-10`} />
            </div>
            <button type="button" disabled={!dirty || busy} onClick={() => saveMessage()} className="h-10 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50">
              Guardar mail
            </button>
          </div>
        </section>

        {/* Cargar la lista */}
        <section className="space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="font-semibold">Cargar la lista</h2>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 py-6 text-sm font-semibold text-primary transition hover:bg-primary/5"
          >
            <FileSpreadsheet className="h-5 w-5" /> Subir Excel o CSV
          </button>
          <p className="text-xs text-muted-foreground">Toma la columna de mail (Email, Correo o Mail) y, si están, Nombre / Apellido y Empresa. Los mails repetidos no se duplican.</p>
          <div>
            <label className="mb-1.5 block text-sm font-medium" htmlFor="inv-paste">O pegá los mails</label>
            <textarea id="inv-paste" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={"ana@estudio.com, Ana Gómez, Estudio AV\nJuan Pérez <juan@empresa.com>"} className={`${field} py-2`} />
            <button type="button" disabled={!pasted.trim() || busy} onClick={addPasted} className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-secondary disabled:opacity-50">
              <Upload className="h-4 w-4" /> Agregar
            </button>
          </div>
        </section>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Así le llega</h2>
          <p className="text-sm text-muted-foreground">
            <b>Asunto:</b> {preview.subject} · ejemplo con {sample.name || "el primer invitado"}
          </p>
        </div>
        <iframe title="Vista previa del mail" srcDoc={preview.html} className="h-[720px] w-full rounded-lg border border-border bg-[#eef0f3]" />
        <p className="mt-2 text-xs text-muted-foreground">Los datos del evento salen de «Información útil» de la pantalla de confirmación; el logo y el título, de la bienvenida.</p>
      </section>

      {/* Envío y seguimiento */}
      <section className="rounded-xl border border-border bg-card shadow-sm">
        <div className="flex flex-wrap items-center gap-2 border-b border-border p-4">
          <Stat label="Invitados" value={counts.total} />
          <Stat label="Sin enviar" value={counts.pending} />
          <Stat label="Enviados" value={counts.sent} />
          <Stat label="Abrieron" value={counts.opened} />
          <Stat label="Respondieron" value={counts.responded} strong />
          {counts.problems ? <Stat label="Con problemas" value={counts.problems} warn /> : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!account.ready || busy || sending || !counts.pending || form.status !== "OPEN"}
              onClick={() => void send("pending")}
              className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              <Send className="h-4 w-4" /> Mandar invitación ({counts.pending})
            </button>
            <button
              type="button"
              disabled={!account.ready || busy || sending || !counts.waiting || form.status !== "OPEN"}
              onClick={() => void send("reminder")}
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50"
            >
              <BellRing className="h-4 w-4" /> Recordar a los que faltan ({counts.waiting})
            </button>
            <button type="button" disabled={!account.ready || busy || sending || !counts.sent} onClick={checkInbox} className="inline-flex h-10 items-center gap-2 rounded-md border border-border px-4 text-sm font-medium hover:bg-secondary disabled:opacity-50" title="Busca respuestas por mail y rebotes en la bandeja de entrada">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Inbox className="h-4 w-4" />} Revisar casilla
            </button>
            <button type="button" disabled={!invites.length} onClick={downloadCsv} className="inline-flex h-10 items-center gap-2 rounded-md px-3 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-50">
              <Download className="h-4 w-4" /> Descargar
            </button>
          </div>
        </div>

        {progress ? (
          <div className="border-b border-border bg-primary/5 px-4 py-3">
            <p className="text-sm font-medium">
              {progress.mode === "pending" ? "Mandando invitaciones" : "Mandando recordatorios"}: {progress.sent} de {progress.total}. Salen de a tandas, no cierres esta pestaña.
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-primary/15">
              <div className="h-full bg-primary transition-[width] duration-500" style={{ width: `${Math.round((progress.sent / Math.max(progress.total, 1)) * 100)}%` }} />
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-sm">
          {(
            [
              ["all", `Todos (${counts.total})`],
              ["waiting", `Sin responder (${counts.waiting})`],
              ["done", `Respondieron (${counts.responded})`],
              ["problems", `Con problemas (${counts.problems})`],
            ] as const
          ).map(([key, text]) => (
            <button key={key} type="button" onClick={() => setFilter(key)} className={`rounded-md px-3 py-1.5 ${filter === key ? "bg-secondary font-semibold" : "text-muted-foreground hover:bg-secondary/60"}`}>
              {text}
            </button>
          ))}
          {selected.length ? (
            <button type="button" onClick={() => void removeSelected()} className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-destructive hover:bg-destructive/10">
              <Trash2 className="h-4 w-4" /> Quitar {selected.length}
            </button>
          ) : null}
        </div>

        {visible.length ? (
          <div className="overflow-x-auto p-4 pt-2">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="w-8 py-2">
                    <input
                      type="checkbox"
                      aria-label="Elegir todos"
                      checked={visible.every((i) => selected.includes(i.id))}
                      onChange={(e) => setSelected(e.target.checked ? visible.map((i) => i.id) : [])}
                    />
                  </th>
                  <th className="py-2">Persona</th>
                  <th className="py-2">Empresa</th>
                  <th className="py-2">Estado</th>
                  <th className="py-2">Enviado</th>
                  <th className="py-2">Abrió</th>
                  <th className="py-2">Respondió</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((i) => {
                  const st = stage(i);
                  return (
                    <tr key={i.id} className="border-b border-border/60 align-top last:border-0">
                      <td className="py-2.5">
                        <input type="checkbox" aria-label={`Elegir ${i.email}`} checked={selected.includes(i.id)} onChange={(e) => setSelected((prev) => (e.target.checked ? [...prev, i.id] : prev.filter((x) => x !== i.id)))} />
                      </td>
                      <td className="py-2.5 pr-3">
                        <p className="font-medium">{i.name || "—"}</p>
                        <p className="text-xs text-muted-foreground">{i.email}</p>
                        {i.replySnippet ? (
                          <p className="mt-1 max-w-md whitespace-pre-line rounded-md bg-secondary/60 px-2 py-1 text-xs" title={`Respondió por mail el ${shortDate(i.repliedAt)}`}>
                            <b>Por mail:</b> {i.replySnippet.length > 220 ? `${i.replySnippet.slice(0, 220)}…` : i.replySnippet}
                          </p>
                        ) : null}
                        {i.lastError && (i.status === "FAILED" || i.status === "BOUNCED") ? <p className="mt-1 max-w-md text-xs text-destructive">{i.lastError}</p> : null}
                      </td>
                      <td className="py-2.5 pr-3 text-muted-foreground">{i.company || "—"}</td>
                      <td className="py-2.5 pr-3">
                        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${st.tone}`}>{st.label}</span>
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{shortDate(i.sentAt)}</td>
                      <td className="py-2.5 pr-3 text-xs text-muted-foreground">{shortDate(i.openedAt)}</td>
                      <td className="py-2.5 text-xs text-muted-foreground">{shortDate(i.respondedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">{invites.length ? "Nadie en este filtro." : "Todavía no hay invitados: subí el Excel o pegá los mails."}</p>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, strong, warn }: { label: string; value: number; strong?: boolean; warn?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-1.5 ${warn ? "bg-red-50 text-red-800" : strong ? "bg-emerald-50 text-emerald-800" : "bg-secondary/60"}`}>
      <p className="text-lg font-semibold leading-none tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] uppercase tracking-wide opacity-75">{label}</p>
    </div>
  );
}
