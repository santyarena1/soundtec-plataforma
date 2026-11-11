import { requirePermission } from "@/lib/auth-helpers";
import { getMailAccountSummary } from "@/lib/mail/account";
import { SettingsSectionHeader } from "@/components/admin/settings-section-header";
import { MailAccountForm } from "./mail-account-form";

export const metadata = { title: "Admin · Correo de envío" };

export default async function MailAccountPage() {
  await requirePermission("api_keys.manage");
  const account = await getMailAccountSummary();
  return (
    <div className="space-y-5">
      <SettingsSectionHeader href="/admin/settings/correo" />
      <MailAccountForm initial={account} />
    </div>
  );
}
