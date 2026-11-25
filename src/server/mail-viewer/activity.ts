import { prisma } from "@/lib/prisma";
import { buildTimeline, countByType, inboxItem, inviteItems, mailLogItem, type ActivityFilters, type ActivityItem, type ActivityType } from "@/lib/mail-viewer/activity";
import { toMailboxError } from "@/lib/mail-viewer/errors";
import { getMailbox, loadFolders, recentMessages } from "./service";

/** Ventanas de tiempo de «Actividad» (días). */
export const ACTIVITY_RANGES = [7, 14, 30, 90] as const;
export type ActivityRange = (typeof ACTIVITY_RANGES)[number];
const MAX_DB_ROWS = 600;
const MAX_INBOX = 150;

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

/**
 * Todo lo que pasó por la casilla en los últimos `days` días: mails del
 * sistema (MailLog), lo recibido en Recibidos (con rebotes marcados) e
 * invitaciones de Formularios. Si la casilla no responde, igual muestra lo de
 * la base y avisa.
 */
export async function loadActivity(filters: ActivityFilters, days: ActivityRange): Promise<ActivityResult> {
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

  let inboxError: string | null = null;
  let inbox: ActivityItem[] = [];
  try {
    const { provider } = await getMailbox();
    const folders = await loadFolders(provider);
    const inboxFolder = folders.find((f) => f.specialUse === "\\Inbox");
    if (inboxFolder) inbox = (await recentMessages(provider, inboxFolder.path, ymd(since), MAX_INBOX)).map(inboxItem);
  } catch (error) {
    inboxError = toMailboxError(error).message;
  }

  const all: ActivityItem[] = [
    ...logs.map(mailLogItem),
    ...invites.flatMap((inv) => inviteItems({ ...inv, formTitle: inv.form.title })),
    ...inbox,
  ].filter((item) => item.at >= since.toISOString());
  return {
    items: buildTimeline(all, filters),
    counts: countByType(buildTimeline(all, { ...filters, type: null })),
    inboxError,
    truncated: logs.length >= MAX_DB_ROWS || invites.length >= MAX_DB_ROWS,
  };
}
