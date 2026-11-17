import Link from "next/link";
import { notFound } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getMailingConfig } from "@/lib/mailing/config";
import type { TemplateWarning } from "@/lib/mailing/html-template";
import { TemplateEditor } from "./template-editor";

export const metadata = { title: "Admin · Plantilla de mail" };

export default async function MailTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("marketing.manage");
  const { id } = await params;
  const [template, config] = await Promise.all([prisma.mailTemplate.findUnique({ where: { id } }), getMailingConfig()]);
  if (!template) notFound();
  return (
    <div className="space-y-4">
      <Link href="/admin/mailing/plantillas" className="text-sm text-muted-foreground hover:text-foreground">
        ← Plantillas
      </Link>
      <TemplateEditor
        template={{
          id: template.id,
          name: template.name,
          description: template.description ?? "",
          html: template.html,
          warnings: (Array.isArray(template.warnings) ? template.warnings : []) as unknown as TemplateWarning[],
        }}
        footer={config.footer}
      />
    </div>
  );
}
