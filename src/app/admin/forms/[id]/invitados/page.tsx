import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/forms/types";
import { DEFAULT_INVITE_MESSAGE } from "@/lib/forms/invite-email";
import { getMailAccountSummary } from "@/lib/mail/account";
import { InvitesManager } from "./invites-manager";

export const metadata = { title: "Admin · Invitados del formulario" };

export default async function FormInvitesPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("forms.manage");
  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    select: { id: true, title: true, token: true, status: true, settings: true, invites: { orderBy: { createdAt: "asc" } } },
  });
  if (!form) notFound();
  const settings = readSettings(form.settings);
  const account = await getMailAccountSummary();

  return (
    <div className="space-y-4">
      <Link href={`/admin/forms/${form.id}`} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {form.title}
      </Link>
      <InvitesManager
        form={{ id: form.id, title: form.title, status: form.status }}
        account={{ user: account.user, ready: Boolean(account.user && account.hasPassword) }}
        message={{
          subject: settings.inviteSubject ?? form.title,
          body: settings.inviteMessage ?? DEFAULT_INVITE_MESSAGE,
          button: settings.inviteButton ?? "Confirmar asistencia",
        }}
        look={{
          eventTitle: settings.welcomeTitle || form.title,
          details: settings.endInfo ?? [],
          accent: settings.accent ?? "black",
          // Ruta relativa: la vista previa (iframe) la resuelve contra este mismo sitio.
          headerPath: `/api/forms/mail-header${settings.logoUrl || settings.welcomeImageUrl ? `?u=${encodeURIComponent((settings.logoUrl || settings.welcomeImageUrl)!)}` : ""}`,
        }}
        invites={form.invites.map((i) => ({
          id: i.id,
          email: i.email,
          name: i.name ?? "",
          company: i.company ?? "",
          status: i.status,
          sentAt: i.sentAt?.toISOString() ?? null,
          openedAt: i.openedAt?.toISOString() ?? null,
          respondedAt: i.respondedAt?.toISOString() ?? null,
          repliedAt: i.repliedAt?.toISOString() ?? null,
          replySnippet: i.replySnippet ?? "",
          lastError: i.lastError ?? "",
        }))}
      />
    </div>
  );
}
