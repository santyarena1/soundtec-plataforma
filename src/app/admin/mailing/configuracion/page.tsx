import { requireStaff } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { MailingNav } from "@/components/mailing/mailing-nav";
import { getMailingConfigSummary } from "@/lib/mailing/config";
import { permissionsHave } from "@/lib/permissions";
import { appUrl } from "@/lib/app-url";
import { MailingConfigForm } from "./config-form";

export const metadata = { title: "Admin · Configuración de campañas" };

export default async function MailingConfigPage() {
  const { permissions, user } = await requireStaff("marketing.manage");
  const summary = await getMailingConfigSummary();
  const canEditKeys = permissionsHave(permissions, "api_keys.manage");

  return (
    <div className="space-y-6">
      <PageHeader title="Configuración de campañas" description="Cuenta de Resend, dominio de envío, remitente, pie legal y límites para no quemar el dominio." />
      <MailingNav active="configuracion" simulate={summary.simulate ? { reason: summary.simulateReason } : null} />
      <MailingConfigForm
        summary={{
          from: summary.from,
          replyTo: summary.replyTo,
          footer: summary.footer,
          dailyLimit: summary.dailyLimit,
          batchSize: summary.batchSize,
          simulate: summary.simulate,
          forcedSimulate: summary.forcedSimulate,
          domain: summary.domain,
          apiKeySource: summary.apiKeySource,
          apiKeyMasked: summary.apiKeyMasked,
          webhookSecretSource: summary.webhookSecretSource,
          webhookSecretMasked: summary.webhookSecretMasked,
        }}
        canEditKeys={canEditKeys}
        webhookUrl={`${appUrl()}/api/webhooks/resend`}
        defaultTestEmail={user.email ?? ""}
      />
    </div>
  );
}
