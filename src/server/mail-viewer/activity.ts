import { prisma } from "@/lib/prisma";
import { buildTimeline, countByType, inboxItem, inviteItems, mailLogItem, type ActivityFilters, type ActivityItem, type ActivityType } from "@/lib/mail-viewer/activity";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { cached } from "./cache";
import { getMailbox, loadFolders, recentMessages } from "./service";

/** Ventanas de tiempo de «Actividad» (días). */
export const ACTIVITY_RANGES = [7, 14, 30, 90] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];
const MAX_DB_ROWS = 600;
const MAX_INBOX = 150;
/** Lo recibido en la casilla para «Actividad» (se descarta con «Actualizar»). */
const INBOX_ACTIVITY_TTL_MS = 2 * 60_000;

export function parseRange(value: string | undefined): ActivityRange {
  const n = Number(value);
  return (ACTIVITY_RANGES as readonly number[]).includes(n) ? (n as ActivityRange) : 14;
}

function ymd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export type ActivityResult = {
  items: ActivityItem[];
  counts: Record<ActivityType, number>;
  inboxError: string | null;
  truncated: boolean;
};

export type ActivityBase = { since: Date; items: ActivityItem[]; truncated: boolean };

/** Lo que está en la base (mails del sistema e invitaciones): rápido, se muestra primero. */
export async function loadActivityBase(days: ActivityRange): Promise<ActivityBase> {
  const since = new Date(Date.now() - days * 86_400_000);
  const [logs, invites] = await Promise.all([
    prisma.mailLog.findMany({
      where: { createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      take: MAX_DB_ROWS,
      select: { id: true, kind: true, to: true, subject: true, status: true, channel: true, error: true, attempts: true, sentAt: true, createdAt: true },
    }),
    prisma.formInvite.findMany({
      where: { updatedAt: { gte: since }, OR: [{ sentAt: { not: null } }, { status: { in: ["FAILED", "BOUNCED"] } }] },
      orderBy: { updatedAt: "desc" },
      take: MAX_DB_ROWS,
      select: {
        id: true,
        formId: true,
        email: true,
        status: true,
        sentAt: true,
        sendCount: true,
        lastError: true,
        openedAt: true,
        clickedAt: true,
        respondedAt: true,
        repliedAt: true,
        replySnippet: true,
        updatedAt: true,
        form: { select: { title: true } },
      },
    }),
  ]);
  return {
    since,
    items: [...logs.map(mailLogItem), ...invites.flatMap((inv) => inviteItems({ ...inv, formTitle: inv.form.title }))],
    truncated: logs.length >= MAX_DB_ROWS || invites.length >= MAX_DB_ROWS,
  };
}

/** Lo recibido en Recibidos en los últimos `days` días (IMAP, con caché). Si la casilla no responde, avisa. */
export async function loadInboxActivity(days: ActivityRange): Promise<{ items: ActivityItem[]; error: string | null }> {
  const since = new Date(Date.now() - days * 86_400_000);
  try {
    const { provider } = await getMailbox();
    const day = ymd(since);
    const items = await cached(`${provider.accountKey}:activity:${day}`, INBOX_ACTIVITY_TTL_MS, async () => {
      const folders = await loadFolders(provider);
      const inboxFolder = folders.find((f) => f.specialUse === "\\Inbox");
      return inboxFolder ? (await recentMessages(provider, inboxFolder.path, day, MAX_INBOX)).map(inboxItem) : [];
    });
    return { items, error: null };
  } catch (error) {
    return { items: [], error: toMailboxError(error).message };
  }
}

/** Línea de tiempo con lo de la base y (si ya llegó) lo de la casilla. */
export function buildActivity(base: ActivityBase, inbox: ActivityItem[], inboxError: string | null, filters: ActivityFilters): ActivityResult {
  const all = [...base.items, ...inbox].filter((item) => item.at >= base.since.toISOString());
  return {
    items: buildTimeline(all, filters),
    counts: countByType(buildTimeline(all, { ...filters, type: null })),
    inboxError,
    truncated: base.truncated,
  };
}

/**
 * Todo lo que pasó por la casilla en los últimos `days` días: mails del
 * sistema (MailLog), lo recibido en Recibidos (con rebotes marcados) e
 * invitaciones de Formularios. Si la casilla no responde, igual muestra lo de
 * la base y avisa.
 */
export async function loadActivity(filters: ActivityFilters, days: ActivityRange): Promise<ActivityResult> {
  const [base, inbox] = await Promise.all([loadActivityBase(days), loadInboxActivity(days)]);
  return buildActivity(base, inbox.items, inbox.error, filters);
}
