import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getFormsMailSummary, getMailAccountSummary } from "@/lib/mail/account";
import { getTransactionalSettings } from "@/lib/mail/transactional/settings";
import { mailKindLabel } from "@/lib/mail/transactional/kinds";
import { isSimulatedTransport, smtpSentLastHour } from "@/server/mail/transactional";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { MailAccountForm } from "./mail-account-form";
import { MailDeliveryForm } from "./mail-delivery-form";
import { FormsAccountForm } from "./forms-account-form";
import { MailLogTable } from "./mail-log-table";

export const metadata = { title: "Admin · Correo" };
export const dynamic = "force-dynamic";

const LOG_ROWS = 40;

export default async function MailAccountPage() {
  await requirePermission("api_keys.manage");
  const [account, settings, forms, logs, lastHour, pending] = await Promise.all([
    getMailAccountSummary(),
    getTransactionalSettings(),
    getFormsMailSummary(),
    prisma.mailLog.findMany({
      orderBy: { createdAt: "desc" },
      take: LOG_ROWS,
      select: { id: true, kind: true, to: true, subject: true, status: true, channel: true, error: true, attempts: true, createdAt: true, sentAt: true, payload: true },
    }),
    smtpSentLastHour().catch(() => 0),
    prisma.mailLog.count({ where: { status: { in: ["FAILED", "SKIPPED", "QUEUED"] }, payload: { not: null } } }),
  ]);

  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/correo" />
      {isSimulatedTransport() ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          Modo de prueba local: los mails no salen a internet, se guardan como archivo (MAIL_TRANSPORT=stream).
        </p>
      ) : null}
      <MailAccountForm initial={{ ...account, replyTo: settings.replyTo }} />
      <MailDeliveryForm
        initial={{
          hourlyLimit: settings.hourlyLimit,
          sentCopy: settings.sentCopy,
          resendFallback: settings.resendFallback,
          recipients: settings.recipients,
          clientToggles: settings.clientToggles,
        }}
        resendAvailable={settings.resendAvailable}
        sentLastHour={lastHour}
      />
      <FormsAccountForm initial={forms} portalUser={account.user} />
      <MailLogTable
        pending={pending}
        rows={logs.map((l) => ({
          id: l.id,
          kind: mailKindLabel(l.kind),
          to: l.to,
          subject: l.subject,
          status: l.status,
          channel: l.channel,
          error: l.error,
          attempts: l.attempts,
          createdAt: l.createdAt.toISOString(),
          retryable: l.status !== "SENT" && Boolean(l.payload),
        }))}
      />
    </div>
  );
}
