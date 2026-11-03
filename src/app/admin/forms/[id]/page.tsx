import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { isBlockType, readConfig, readSettings } from "@/lib/forms/types";
import { FormBuilder } from "./form-builder";
import type { EditableBlock } from "./block-editor";

export const metadata = { title: "Admin · Editar formulario" };

export default async function FormEditorPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff("forms.manage");
  const { id } = await params;
  const form = await prisma.form.findUnique({
    where: { id },
    include: { blocks: { orderBy: { sortOrder: "asc" } }, _count: { select: { responses: true } } },
  });
  if (!form) notFound();

  const blocks: EditableBlock[] = form.blocks
    .filter((b) => isBlockType(b.type))
    .map((b) => ({ id: b.id, type: b.type as EditableBlock["type"], title: b.title, body: b.body, required: b.required, config: readConfig(b.config) }));

  return (
    <div className="space-y-4">
      <Link href="/admin/forms" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Formularios
      </Link>
      <FormBuilder
        form={{
          id: form.id,
          title: form.title,
          token: form.token,
          status: form.status,
          closesAt: form.closesAt ? new Date(form.closesAt.getTime() - form.closesAt.getTimezoneOffset() * 60000).toISOString() : null,
          settings: readSettings(form.settings),
        }}
        initialBlocks={blocks}
        responseCount={form._count.responses}
      />
    </div>
  );
}
