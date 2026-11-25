import Link from "next/link";
import { FlaskConical, MailWarning, RefreshCw } from "lucide-react";
import { getImpersonation, requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMailAccountSummary } from "@/lib/mail/account";
import { PageHeader } from "@/components/ui/page-header";
import { parseActivityFilters } from "@/lib/mail-viewer/activity";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { prepareViewerHtml } from "@/lib/mail-viewer/sanitize";
import { parseFilters, parsePage, parseUid } from "@/lib/mail-viewer/search";
import type { ViewerState } from "@/lib/mail-viewer/links";
import { ActivityView } from "@/components/mail-viewer/activity-view";
import { FolderNav, MessageList, SearchBar, ViewerTabs } from "@/components/mail-viewer/mailbox-parts";
import { MessageView, type RelatedLog } from "@/components/mail-viewer/message-view";
import { invalidate } from "@/server/mail-viewer/cache";
import { loadActivity, parseRange } from "@/server/mail-viewer/activity";
import { getMailbox, listMessages, loadFolders, loadThread, openMessage, resolveFolder } from "@/server/mail-viewer/service";
import type { MailboxProvider } from "@/server/mail-viewer/provider";

export const metadata = { title: "Admin · Correo del portal" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-4 text-sm">
      <MailWarning className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
      <div>
        <p className="font-semibold text-destructive">{message}</p>
        <p className="mt-1 text-muted-foreground">
          La casilla se configura en{" "}
          <Link href="/admin/settings/correo" className="font-medium text-foreground underline">
            Configuración › Correo
          </Link>
          . Ahí está «Probar conexión».
        </p>
      </div>
    </div>
  );
}

async function relatedLogsFor(recipients: string[]): Promise<RelatedLog[]> {
  if (!recipients.length) return [];
  return prisma.mailLog.findMany({
    where: { OR: recipients.slice(0, 5).map((r) => ({ to: { contains: r, mode: "insensitive" as const } })) },
    orderBy: { createdAt: "desc" },
    take: 5,
    select: { id: true, kind: true, to: true, subject: true, status: true, sentAt: true, createdAt: true },
  });
}

async function Mailbox({ sp, provider, readOnly }: { sp: SearchParams; provider: MailboxProvider; readOnly: boolean }) {
  const folders = await loadFolders(provider);
  const folder = resolveFolder(folders, sp.carpeta);
  if (!folder) return <ErrorCard message="La casilla no tiene carpetas para mostrar." />;
  const filters = parseFilters(sp);
  const uid = parseUid(sp.uid);
  const state: ViewerState = { folder: folder.path, filters, page: parsePage(sp.pagina), uid };
  const [page, opened] = await Promise.all([
    listMessages(provider, folder.path, filters, state.page),
    uid ? openMessage(provider, folder.path, uid).catch((error) => toMailboxError(error)) : Promise.resolve(null),
  ]);
  const message = opened && !(opened instanceof Error) ? opened : null;
  const [thread, relatedLogs] = message
    ? await Promise.all([loadThread(provider, folders, message.detail), relatedLogsFor(message.detail.bounce?.recipients ?? [])])
    : [[], []];
  const blockedImages = message?.html ? prepareViewerHtml(message.html, { allowRemoteImages: false, inlineImages: message.inlineImages }).blockedImages : 0;

  return (
    <div className={`grid gap-4 ${uid ? "xl:grid-cols-[200px_minmax(0,0.85fr)_minmax(0,1.35fr)]" : "lg:grid-cols-[200px_minmax(0,1fr)]"}`}>
      <aside className={uid ? "hidden xl:block" : ""}>
        <FolderNav folders={folders} state={state} />
      </aside>
      <section className={`min-w-0 space-y-3 ${uid ? "hidden xl:block" : ""}`}>
        <SearchBar state={state} />
        <MessageList page={page} state={state} sentFolder={folder.specialUse === "\\Sent" || folder.specialUse === "\\Drafts"} />
      </section>
      {uid ? (
        <section className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          {message ? (
            <MessageView detail={message.detail} state={state} folders={folders} thread={thread} blockedImages={blockedImages} readOnly={readOnly} relatedLogs={relatedLogs} />
          ) : (
            <ErrorCard message={opened instanceof Error ? opened.message : "No se encontró el mensaje."} />
          )}
        </section>
      ) : null}
    </div>
  );
}

export default async function MailViewerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const view = sp.vista === "actividad" ? "actividad" : "bandeja";
  const [summary, impersonation] = await Promise.all([getMailAccountSummary(), getImpersonation()]);
  const readOnly = Boolean(impersonation);

  let provider: MailboxProvider | null = null;
  let demo = false;
  let setupError: string | null = null;
  try {
    ({ provider, demo } = await getMailbox());
    if (sp.fresco === "1") invalidate(`${provider.accountKey}:`);
  } catch (error) {
    setupError = toMailboxError(error).message;
  }

  let body: React.ReactNode;
  if (view === "actividad") {
    const filters = parseActivityFilters(sp);
    const days = parseRange(sp.dias);
    const activity = await loadActivity(filters, days);
    body = <ActivityView {...activity} filters={filters} days={days} page={parsePage(sp.pagina)} />;
  } else if (!provider) {
    body = <ErrorCard message={setupError ?? "No se pudo abrir la casilla."} />;
  } else {
    try {
      body = await Mailbox({ sp, provider, readOnly });
    } catch (error) {
      body = <ErrorCard message={toMailboxError(error).message} />;
    }
  }

  const refreshHref = `/admin/correo?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp).filter(([k, v]) => k !== "fresco" && typeof v === "string")), fresco: "1" } as Record<string, string>)}`;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Correo del portal"
        description={
          <>
            Todo lo que hay en la casilla {summary.user ? <b className="text-foreground">{summary.user}</b> : "del portal"} y cada movimiento: lo que manda el sistema, lo que llega y los rebotes. Solo lectura: abrir un mensaje no lo marca como leído.
          </>
        }
        actions={
          <Link href={refreshHref} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-sm font-medium hover:bg-secondary">
            <RefreshCw className="h-4 w-4" /> Actualizar
          </Link>
        }
      />
      <ViewerTabs active={view} />
      {demo ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <FlaskConical className="h-4 w-4 shrink-0" /> Modo demostración (MAIL_VIEWER_DEMO): datos de ejemplo, no es la casilla real.
        </p>
      ) : null}
      {readOnly ? <p className="text-xs text-muted-foreground">Estás en «Ver como»: la casilla se puede mirar pero no se cambia nada.</p> : null}
      {body}
    </div>
  );
}
