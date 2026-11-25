import { Suspense } from "react";
import Link from "next/link";
import { FlaskConical, MailWarning } from "lucide-react";
import { getImpersonation, requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMailAccountSummary } from "@/lib/mail/account";
import { PageHeader } from "@/components/ui/page-header";
import { parseActivityFilters, type ActivityFilters } from "@/lib/mail-viewer/activity";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { filtersKey, parseFilters, parsePage, parseUid } from "@/lib/mail-viewer/search";
import type { ViewerState } from "@/lib/mail-viewer/links";
import type { FolderInfo, MessageFilters, MessagePage } from "@/lib/mail-viewer/types";
import { ActivityView } from "@/components/mail-viewer/activity-view";
import { RefreshButton } from "@/components/mail-viewer/client-bits";
import { FolderNav, FolderNavSkeleton, MessageList, MessageListSkeleton, MessageSkeleton, SearchBar, ViewerTabs } from "@/components/mail-viewer/mailbox-parts";
import { MessageView, ThreadList, type RelatedLog } from "@/components/mail-viewer/message-view";
import { buildActivity, loadActivityBase, loadInboxActivity, parseRange, type ActivityBase, type ActivityRange } from "@/server/mail-viewer/activity";
import { getMailbox, invalidateListings, listMessages, loadFolders, loadThread, openMessage, preparedHtml, quickFolderPath, resolveFolder } from "@/server/mail-viewer/service";
import type { ParsedMessage } from "@/server/mail-viewer/parse";
import type { MailboxProvider } from "@/server/mail-viewer/provider";

export const metadata = { title: "Admin · Correo del portal" };
export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | undefined>;

/*
 * La página no espera a la casilla: arriba sale al toque y carpetas, listado,
 * mensaje y conversación llegan cada uno por su lado (streaming con Suspense),
 * todos pedidos en paralelo por conexiones IMAP que quedan abiertas.
 */

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

/** Evita «unhandled rejection» si una parte no llega a esperar su promesa; quien la espera igual ve el error. */
function quiet<T>(promise: Promise<T>): Promise<T> {
  promise.catch(() => undefined);
  return promise;
}

type MailboxLoad = {
  provider: MailboxProvider;
  filters: MessageFilters;
  page: number;
  uid: number | null;
  /** Ruta con la que se arrancó a pedir listado y mensaje sin esperar la lista de carpetas (o null). */
  quick: string | null;
  readOnly: boolean;
  folders: Promise<FolderInfo[]>;
  /** Carpeta real (alias y carpetas que no existen se resuelven con la lista). */
  folder: Promise<FolderInfo | null>;
  list: Promise<MessagePage>;
  message: Promise<ParsedMessage> | null;
};

function startMailbox(provider: MailboxProvider, sp: SearchParams, readOnly: boolean): MailboxLoad {
  const filters = parseFilters(sp);
  const page = parsePage(sp.pagina);
  const uid = parseUid(sp.uid);
  const folders = quiet(loadFolders(provider));
  const quick = quickFolderPath(sp.carpeta);
  const folder = quiet(folders.then((list) => resolveFolder(list, sp.carpeta)));
  // Con la ruta ya conocida (INBOX o una carpeta por nombre), listado y mensaje no esperan a las carpetas.
  const pathFor = async (): Promise<string> => {
    if (quick) return quick;
    const resolved = await folder;
    if (!resolved) throw new Error("La casilla no tiene carpetas para mostrar.");
    return resolved.path;
  };
  const list = quiet(pathFor().then((path) => listMessages(provider, path, filters, page)));
  const message = uid ? quiet(pathFor().then((path) => openMessage(provider, path, uid))) : null;
  return { provider, filters, page, uid, quick, readOnly, folders, folder, list, message };
}

/**
 * Lo que se pidió por adelantado, si era de la carpeta correcta. Si la carpeta de
 * la URL no existe, se vuelve a pedir en la real (Recibidos), como antes.
 */
async function forFolder<T>(early: Promise<T>, load: MailboxLoad, path: string, again: () => Promise<T>): Promise<T> {
  if (load.quick === null || load.quick === path) return early;
  early.catch(() => undefined);
  return again();
}

/** Estado de los enlaces con la carpeta ya resuelta (si la pedida no existía, la lista se vuelve a pedir en la real). */
async function resolvedState(load: MailboxLoad): Promise<{ state: ViewerState; folder: FolderInfo; folders: FolderInfo[] } | null> {
  const [folders, folder] = await Promise.all([load.folders, load.folder]);
  if (!folder) return null;
  return { state: { folder: folder.path, filters: load.filters, page: load.page, uid: load.uid }, folder, folders };
}

async function FoldersSlot({ load }: { load: MailboxLoad }) {
  try {
    const resolved = await resolvedState(load);
    if (!resolved) return null;
    return <FolderNav folders={resolved.folders} state={resolved.state} />;
  } catch {
    // El error se muestra una sola vez, en el listado.
    return null;
  }
}

async function ListSlot({ load }: { load: MailboxLoad }) {
  try {
    const resolved = await resolvedState(load);
    if (!resolved) return <ErrorCard message="La casilla no tiene carpetas para mostrar." />;
    const path = resolved.folder.path;
    const page = await forFolder(load.list, load, path, () => listMessages(load.provider, path, load.filters, load.page));
    const sent = resolved.folder.specialUse === "\\Sent" || resolved.folder.specialUse === "\\Drafts";
    return <MessageList page={page} state={resolved.state} sentFolder={sent} />;
  } catch (error) {
    return <ErrorCard message={toMailboxError(error).message} />;
  }
}

async function ThreadSlot({ load, message, state }: { load: MailboxLoad; message: ParsedMessage; state: ViewerState }) {
  const folders = await load.folders.catch(() => [] as FolderInfo[]);
  const thread = await loadThread(load.provider, folders, message.detail);
  return <ThreadList detail={message.detail} state={state} folders={folders} thread={thread} />;
}

async function MessageSlot({ load }: { load: MailboxLoad }) {
  if (!load.message) return null;
  let message: ParsedMessage;
  let state: ViewerState;
  try {
    const resolved = await resolvedState(load);
    if (!resolved) return <ErrorCard message="No se encontró el mensaje." />;
    const path = resolved.folder.path;
    const uid = load.uid!;
    message = await forFolder(load.message, load, path, () => openMessage(load.provider, path, uid));
    state = resolved.state;
  } catch (error) {
    return <ErrorCard message={toMailboxError(error).message} />;
  }
  const relatedLogs = await relatedLogsFor(message.detail.bounce?.recipients ?? []);
  return (
    <MessageView
      detail={message.detail}
      state={state}
      blockedImages={preparedHtml(message, false)?.blockedImages ?? 0}
      readOnly={load.readOnly}
      relatedLogs={relatedLogs}
      thread={
        <Suspense fallback={null}>
          <ThreadSlot load={load} message={message} state={state} />
        </Suspense>
      }
    />
  );
}

function Mailbox({ load, sp }: { load: MailboxLoad; sp: SearchParams }) {
  const { uid } = load;
  // Mientras llegan las carpetas, el buscador usa la carpeta tal como vino en la URL.
  const searchState: ViewerState = { folder: sp.carpeta ?? "INBOX", filters: load.filters, page: load.page, uid };
  const listKey = `${sp.carpeta ?? ""}|${filtersKey(load.filters)}|${load.page}`;
  return (
    <div className={`grid gap-4 ${uid ? "xl:grid-cols-[200px_minmax(0,0.85fr)_minmax(0,1.35fr)]" : "lg:grid-cols-[200px_minmax(0,1fr)]"}`}>
      <aside className={uid ? "hidden xl:block" : ""}>
        <Suspense fallback={<FolderNavSkeleton />}>
          <FoldersSlot load={load} />
        </Suspense>
      </aside>
      <section className={`min-w-0 space-y-3 ${uid ? "hidden xl:block" : ""}`}>
        <SearchBar state={searchState} />
        {/* La clave cambia con carpeta, búsqueda o página: ahí sí se muestra el esqueleto. */}
        <Suspense key={listKey} fallback={<MessageListSkeleton />}>
          <ListSlot load={load} />
        </Suspense>
      </section>
      {uid ? (
        <section className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <Suspense key={`${sp.carpeta ?? ""}:${uid}`} fallback={<MessageSkeleton />}>
            <MessageSlot load={load} />
          </Suspense>
        </section>
      ) : null}
    </div>
  );
}

async function ActivityWithInbox({ base, inbox, filters, days, page }: { base: ActivityBase; inbox: ReturnType<typeof loadInboxActivity>; filters: ActivityFilters; days: ActivityRange; page: number }) {
  const { items, error } = await inbox;
  const activity = buildActivity(base, items, error, filters);
  return <ActivityView {...activity} filters={filters} days={days} page={page} />;
}

async function Activity({ sp }: { sp: SearchParams }) {
  const filters = parseActivityFilters(sp);
  const days = parseRange(sp.dias);
  const page = parsePage(sp.pagina);
  // La casilla arranca ya, a la par de la base; lo de la base se muestra primero.
  const inbox = quiet(loadInboxActivity(days));
  const base = await loadActivityBase(days);
  const dbOnly = buildActivity(base, [], null, filters);
  return (
    <Suspense fallback={<ActivityView {...dbOnly} filters={filters} days={days} page={page} inboxPending />}>
      <ActivityWithInbox base={base} inbox={inbox} filters={filters} days={days} page={page} />
    </Suspense>
  );
}

export default async function MailViewerPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // Lecturas de la base en paralelo con el control de acceso (no se muestra nada si no es admin);
  // la casilla recién se toca después de confirmar que lo es.
  const [, sp, summary, impersonation, mailbox] = await Promise.all([
    requireAdmin(),
    searchParams,
    getMailAccountSummary(),
    getImpersonation(),
    getMailbox().catch((error: unknown) => toMailboxError(error)),
  ]);
  const view = sp.vista === "actividad" ? "actividad" : "bandeja";
  const readOnly = Boolean(impersonation);
  const provider = mailbox instanceof Error ? null : mailbox.provider;
  const demo = mailbox instanceof Error ? false : mailbox.demo;
  // Enlaces viejos con «fresco=1»: descartan listados (no los mensajes).
  if (provider && sp.fresco === "1") invalidateListings(provider);

  let body: React.ReactNode;
  if (view === "actividad") body = <Activity sp={sp} />;
  else if (!provider) body = <ErrorCard message={mailbox instanceof Error ? mailbox.message : "No se pudo abrir la casilla."} />;
  else body = <Mailbox load={startMailbox(provider, sp, readOnly)} sp={sp} />;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Correo del portal"
        description={
          <>
            Todo lo que hay en la casilla {summary.user ? <b className="text-foreground">{summary.user}</b> : "del portal"} y cada movimiento: lo que manda el sistema, lo que llega y los rebotes. Solo lectura: abrir un mensaje no lo marca como leído.
          </>
        }
        actions={<RefreshButton />}
      />
      <ViewerTabs active={view} />
      {demo ? (
        <p className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <FlaskConical className="h-4 w-4 shrink-0" /> Modo demostración (MAIL_VIEWER_DEMO): datos de ejemplo, no es la casilla real.
        </p>
      ) : null}
      {readOnly ? <p className="text-xs text-muted-foreground">Estás en «Ver como»: la casilla se puede mirar pero no se cambia nada.</p> : null}
      {view === "actividad" ? <Suspense fallback={<MessageListSkeleton rows={8} />}>{body}</Suspense> : body}
    </div>
  );
}
