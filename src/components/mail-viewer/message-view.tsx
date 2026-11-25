import Link from "next/link";
import { AlertTriangle, ArrowLeft, Download, MessagesSquare, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn, formatDate } from "@/lib/utils";
import { bounceSeverity } from "@/lib/mail-viewer/bounce";
import { formatBytes } from "@/lib/mail-viewer/attachments";
import { addressText, attachmentHref, bodyHref, listDate, shortAddress, viewerHref, type ViewerState } from "@/lib/mail-viewer/links";
import { kindLabel } from "@/lib/mail-viewer/activity";
import type { FolderInfo, MailAddress, MessageDetail, MessageSummary } from "@/lib/mail-viewer/types";
import { BodyFrame, SeenToggle } from "./body-frame";

export type RelatedLog = { id: string; kind: string; to: string; subject: string; status: string; sentAt: Date | null; createdAt: Date };

function AddressRow({ label, list }: { label: string; list: MailAddress[] }) {
  if (!list.length) return null;
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words">{list.map(addressText).join(", ")}</dd>
    </div>
  );
}

export function MessageView({
  detail,
  state,
  folders,
  thread,
  blockedImages,
  readOnly,
  relatedLogs,
}: {
  detail: MessageDetail;
  state: ViewerState;
  folders: FolderInfo[];
  thread: MessageSummary[];
  blockedImages: number;
  readOnly: boolean;
  relatedLogs: RelatedLog[];
}) {
  const files = detail.attachments.filter((a) => !a.inline || !detail.hasHtml);
  const folderName = (path: string) => folders.find((f) => f.path === path)?.label ?? path;
  return (
    <article className="space-y-3" aria-label="Mensaje">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={viewerHref(state, { uid: null })} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground xl:hidden">
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al listado
        </Link>
        <div className="ml-auto">
          <SeenToggle folder={detail.folder} uid={detail.uid} seen={detail.seen} disabled={readOnly} />
        </div>
      </div>

      <header className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start gap-2">
          <h2 className="min-w-0 flex-1 break-words text-lg font-semibold leading-snug">{detail.subject || "(sin asunto)"}</h2>
          {detail.isBounce ? <Badge tone="destructive">Rebote</Badge> : null}
          {!detail.seen ? <Badge tone="primary">Sin leer</Badge> : null}
          {detail.answered ? <Badge tone="muted">Respondido</Badge> : null}
        </div>
        <dl className="mt-3 space-y-1 text-[13px]">
          <AddressRow label="De" list={detail.from ? [detail.from] : []} />
          <AddressRow label="Para" list={detail.to} />
          <AddressRow label="CC" list={detail.cc} />
          <AddressRow label="Resp. a" list={detail.replyTo} />
          <div className="flex gap-2">
            <dt className="w-14 shrink-0 text-muted-foreground">Fecha</dt>
            <dd>{formatDate(detail.date)}</dd>
          </div>
        </dl>
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Encabezados completos</summary>
          <div className="mt-2 max-h-72 overflow-auto rounded-md bg-secondary/50 p-2 font-mono text-[11px] leading-relaxed">
            {detail.headers.map((h, i) => (
              <p key={i} className="break-all">
                <b>{h.key}:</b> {h.value}
              </p>
            ))}
          </div>
        </details>
      </header>

      {detail.bounce ? (
        <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="flex items-center gap-2 font-semibold text-destructive">
            <AlertTriangle className="h-4 w-4" />
            {bounceSeverity(detail.bounce) === "temporary" ? "Rebote temporal: el servidor va a reintentar" : "Rebote: el mail no se pudo entregar"}
          </p>
          <p className="mt-1">
            {detail.bounce.recipients.length ? (
              <>
                Destinatario{detail.bounce.recipients.length > 1 ? "s" : ""}: <b>{detail.bounce.recipients.join(", ")}</b>
              </>
            ) : (
              "No se pudo leer a quién iba (mirá el texto del mensaje)."
            )}
            {detail.bounce.status ? <span className="text-muted-foreground"> · código {detail.bounce.status}</span> : null}
          </p>
          {detail.bounce.diagnostic ? <p className="mt-1 break-words font-mono text-xs text-muted-foreground">{detail.bounce.diagnostic}</p> : null}
          {relatedLogs.length ? (
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground">Mails del sistema a esa dirección:</p>
              <ul className="mt-1 space-y-0.5 text-xs">
                {relatedLogs.map((log) => (
                  <li key={log.id}>
                    {formatDate(log.sentAt ?? log.createdAt)} · {kindLabel(log.kind)} · «{log.subject}» · {log.status === "SENT" ? "salió" : log.status}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {detail.tooLarge ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Este mensaje es muy pesado para abrirlo entero acá: se muestran los encabezados y el principio. Los adjuntos se pueden bajar igual.
        </p>
      ) : null}

      {files.length ? (
        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Paperclip className="h-3.5 w-3.5" /> {files.length === 1 ? "1 adjunto" : `${files.length} adjuntos`}
          </p>
          <ul className="flex flex-wrap gap-2">
            {files.map((a) => (
              <li key={a.part}>
                <a
                  href={attachmentHref(detail.folder, detail.uid, a.part)}
                  className="inline-flex max-w-[280px] items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-xs hover:border-primary/40 hover:bg-secondary/60"
                  download
                >
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{a.filename}</span>
                  <span className="shrink-0 text-muted-foreground">{formatBytes(a.size)}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BodyFrame
        htmlSrc={bodyHref(detail.folder, detail.uid, false)}
        htmlWithImagesSrc={bodyHref(detail.folder, detail.uid, true)}
        hasHtml={detail.hasHtml}
        text={detail.text}
        blockedImages={blockedImages}
      />

      {thread.length ? (
        <section className="rounded-lg border border-border bg-card p-3">
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <MessagesSquare className="h-3.5 w-3.5" /> Conversación ({thread.length})
          </p>
          <ol className="space-y-1">
            {thread.map((m) => {
              const current = m.folder === detail.folder && m.uid === detail.uid;
              return (
                <li key={`${m.folder}:${m.uid}`}>
                  <Link
                    href={viewerHref(state, { folder: m.folder, uid: m.uid, page: 1, filters: { q: "", from: null, to: null, unread: false } })}
                    className={cn("flex items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-secondary/60", current && "bg-primary/5 font-semibold")}
                  >
                    <span className="w-16 shrink-0 tabular-nums text-muted-foreground">{listDate(m.date)}</span>
                    <span className="w-20 shrink-0 truncate text-muted-foreground">{folderName(m.folder)}</span>
                    <span className="truncate">{shortAddress(m.from)}</span>
                    <span className="truncate text-muted-foreground">— {m.subject}</span>
                  </Link>
                </li>
              );
            })}
          </ol>
        </section>
      ) : null}
    </article>
  );
}
