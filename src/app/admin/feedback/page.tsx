import { requirePermission } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";

export const metadata = { title: "Admin · Feedback de IA" };

const VERDICT_LABEL: Record<string, string> = {
  CORRECT: "Correcto",
  HAS_ERRORS: "Con errores",
  INCOMPLETE: "Incompleto",
};

function verdictTone(verdict: string | null) {
  if (verdict === "CORRECT") return "success" as const;
  if (verdict === "HAS_ERRORS") return "destructive" as const;
  return "muted" as const;
}

export default async function AdminAiFeedbackPage() {
  await requirePermission("ai.manage");

  const [feedback, stats] = await Promise.all([
    prisma.aiContentFeedback.findMany({
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.aiContentFeedback.groupBy({ by: ["verdict"], _count: { _all: true } }),
  ]);

  const productIds = [
    ...new Set(feedback.filter((f) => f.refEntity === "Product").map((f) => f.refId)),
  ];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, normalizedName: true, internalSku: true },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Feedback de IA"
        description="Qué reportaron los usuarios sobre la precisión del contenido generado. Los prompts se editan en Configuración."
        actions={
          <ButtonLink href="/admin/settings/ai" variant="outline" size="sm">
            Editar prompts y modelos
          </ButtonLink>
        }
      />

      {stats.length === 0 ? (
        <Card>
          <CardContent className="p-5">
            <p className="muted-text">Todavía no hay feedback registrado.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {stats.map((s) => (
            <Card key={s.verdict || "null"}>
              <CardContent className="p-5">
                <p className="muted-text">{VERDICT_LABEL[s.verdict || ""] || "Sin clasificar"}</p>
                <p className="text-2xl font-semibold">{s._count._all}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {feedback.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Tipo</TH>
              <TH>Veredicto</TH>
              <TH>Usuario</TH>
              <TH>Comentario</TH>
              <TH>Entidad</TH>
              <TH>Fecha</TH>
            </TR>
          </THead>
          <TBody>
            {feedback.map((f) => (
              <TR key={f.id}>
                <TD>{f.type}</TD>
                <TD>
                  <Badge tone={verdictTone(f.verdict)}>{VERDICT_LABEL[f.verdict || ""] || "—"}</Badge>
                </TD>
                <TD>{f.user?.name || "—"}</TD>
                <TD className="max-w-xs text-xs text-muted-foreground">{truncate(f.comment || "—", 80)}</TD>
                <TD className="text-xs text-muted-foreground">
                  {f.refEntity === "Product" && productMap.get(f.refId) ? (
                    <a href={`/admin/products/${f.refId}`} className="underline hover:text-foreground">
                      {productMap.get(f.refId)!.normalizedName}
                    </a>
                  ) : (
                    `${f.refEntity}/${f.refId.slice(-6)}`
                  )}
                </TD>
                <TD>{formatDate(f.createdAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
