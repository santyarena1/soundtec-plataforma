import Link from "next/link";
import { Prisma } from "@prisma/client";
import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Input, Select } from "@/components/ui/input";
import { AiFeedbackTable } from "@/components/admin/ai-feedback-table";

export const metadata = { title: "Admin · Feedback de IA" };

export default async function AdminAiFeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    verdict?: string;
    type?: string;
    state?: string;
    q?: string;
    page?: string;
  }>;
}) {
  await requirePermission("ai.manage");
  const params = await searchParams;
  const page = Math.max(1, Number(params.page) || 1);
  const where: Prisma.AiContentFeedbackWhereInput = {
    ...(params.verdict ? { verdict: params.verdict as never } : {}),
    ...(params.type ? { type: params.type as never } : {}),
    ...(params.state === "resolved"
      ? { resolvedAt: { not: null } }
      : params.state === "pending"
        ? { resolvedAt: null }
        : {}),
    ...(params.q
      ? {
          refEntity: "Product",
          refId: {
            in: (
              await prisma.product.findMany({
                where: { normalizedName: { contains: params.q, mode: "insensitive" } },
                select: { id: true },
              })
            ).map((p) => p.id),
          },
        }
      : {}),
  };
  const [feedback, total] = await Promise.all([
    prisma.aiContentFeedback.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * 50,
      take: 50,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.aiContentFeedback.count({ where }),
  ]);
  const ids = [...new Set(feedback.filter((f) => f.refEntity === "Product").map((f) => f.refId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids } },
    select: { id: true, normalizedName: true, longDescription: true },
  });
  const productMap = new Map(products.map((p) => [p.id, p]));
  const query = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v && !Array.isArray(v)) as [string, string][],
  );
  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback de IA"
        description={`${total} reportes. La gestión cotidiana también está integrada en Catálogo.`}
      />
      <form className="grid gap-2 rounded-md border bg-card p-4 md:grid-cols-5">
        <Input name="q" defaultValue={params.q} placeholder="Buscar producto…" />
        <Select name="verdict" defaultValue={params.verdict || ""}>
          <option value="">Todos los veredictos</option>
          <option value="CORRECT">Correcto</option>
          <option value="HAS_ERRORS">Con errores</option>
          <option value="UNCLEAR">Sin definir</option>
        </Select>
        <Select name="type" defaultValue={params.type || ""}>
          <option value="">Todos los tipos</option>
          <option value="PRODUCT_DESCRIPTION">Descripción de producto</option>
          <option value="PRODUCT_NORMALIZATION">Normalización</option>
          <option value="COLUMN_MAPPING">Mapeo de columnas</option>
          <option value="REQUEST_RESPONSE">Respuesta de pedido</option>
          <option value="IMAGE_SUGGESTION">Sugerencia de imagen</option>
        </Select>
        <Select name="state" defaultValue={params.state || ""}>
          <option value="">Todos los estados</option>
          <option value="pending">Pendientes</option>
          <option value="resolved">Resueltos</option>
        </Select>
        <button className="rounded-md bg-primary px-4 text-sm text-primary-foreground">
          Filtrar
        </button>
      </form>
      <AiFeedbackTable
        rows={feedback.map((f) => {
          const p = productMap.get(f.refId);
          return {
            id: f.id,
            verdict: f.verdict,
            type: f.type,
            issues: f.issues,
            comment: f.comment,
            generatedText: f.generatedText,
            createdAt: f.createdAt.toISOString(),
            resolvedAt: f.resolvedAt?.toISOString() || null,
            userName: f.user?.name || "—",
            userEmail: f.user?.email || "—",
            productId: p?.id || null,
            productName: p?.normalizedName || `${f.refEntity}/${f.refId.slice(-6)}`,
            currentText: p?.longDescription || null,
          };
        })}
      />
      <div className="flex justify-center gap-4 text-sm">
        {page > 1 ? (
          <Link
            href={`?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page - 1) })}`}
          >
            Anterior
          </Link>
        ) : null}
        {page * 50 < total ? (
          <Link
            href={`?${new URLSearchParams({ ...Object.fromEntries(query), page: String(page + 1) })}`}
          >
            Siguiente
          </Link>
        ) : null}
      </div>
    </div>
  );
}
