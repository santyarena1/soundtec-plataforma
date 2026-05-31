import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { formatDate, truncate } from "@/lib/utils";
import { AiPromptsForm } from "@/components/admin/ai-prompts-form";

export const metadata = { title: "Admin · IA y feedback" };

export default async function AdminAiPage() {
  await requireAdmin();

  const [longDescription, shortDescription, classification, columnMapping, requestResponse] = await Promise.all([
    getSetting("ai.prompt.long_description", ""),
    getSetting("ai.prompt.short_description", ""),
    getSetting("ai.prompt.classification", ""),
    getSetting("ai.prompt.column_mapping", ""),
    getSetting("ai.prompt.request_response", ""),
  ]);

  const feedback = await prisma.aiContentFeedback.findMany({
    orderBy: { createdAt: "desc" },
    take: 80,
    include: { user: { select: { name: true, email: true } } },
  });

  const productIds = [...new Set(
    feedback.filter((f) => f.refEntity === "Product").map((f) => f.refId)
  )];
  const products = productIds.length
    ? await prisma.product.findMany({
        where: { id: { in: productIds } },
        select: { id: true, normalizedName: true, internalSku: true },
      })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const stats = await prisma.aiContentFeedback.groupBy({
    by: ["verdict"],
    _count: { _all: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="IA y feedback"
        description="Contenido generado con OpenAI y respuestas de los usuarios sobre su precisión."
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="mb-4 text-base font-semibold">Prompts personalizados</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Configurá el prompt de sistema para cada función de IA. Si está vacío, se usa el prompt por defecto del sistema.
          </p>
          <AiPromptsForm
            prompts={{ longDescription, shortDescription, classification, columnMapping, requestResponse }}
          />
        </CardContent>
      </Card>

      <h2 className="text-base font-semibold">Feedback de usuarios</h2>

      <div className="grid gap-3 sm:grid-cols-3">
        {stats.length === 0 ? (
          <Card><CardContent className="p-5"><p className="muted-text">Sin feedback registrado todavía.</p></CardContent></Card>
        ) : (
          stats.map((s) => (
            <Card key={s.verdict || "null"}>
              <CardContent className="p-5">
                <p className="muted-text">{s.verdict || "Sin clasificar"}</p>
                <p className="text-2xl font-semibold">{s._count._all}</p>
              </CardContent>
            </Card>
          ))
        )}
      </div>

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
                  <Badge tone={f.verdict === "CORRECT" ? "success" : f.verdict === "HAS_ERRORS" ? "destructive" : "muted"}>
                    {f.verdict || "—"}
                  </Badge>
                </TD>
                <TD>{f.user?.name || "—"}</TD>
                <TD className="max-w-xs text-xs text-muted-foreground">{truncate(f.comment || "—", 80)}</TD>
                <TD className="text-xs text-muted-foreground">
                  {f.refEntity === "Product" && productMap.get(f.refId)
                    ? <a href={`/admin/products/${f.refId}`} className="underline hover:text-foreground">{productMap.get(f.refId)!.normalizedName}</a>
                    : `${f.refEntity}/${f.refId.slice(-6)}`}
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
