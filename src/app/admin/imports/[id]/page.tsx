import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { MappingEditor } from "./mapping-editor";
import { ApproveAllButton } from "./approve-all-button";
import { ArrowLeft, Truck, Tag, FileSpreadsheet } from "lucide-react";
import { CANONICAL_FIELD_LIST } from "@/services/openai";

export default async function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAdmin();

  const batch = await prisma.importBatch.findUnique({
    where: { id },
    include: {
      brand: { select: { name: true } },
      distributor: { select: { name: true } },
      priceList: { select: { name: true } },
      rawProducts: { take: 50, orderBy: { createdAt: "asc" } },
      _count: { select: { rawProducts: true } },
    },
  });
  if (!batch) notFound();

  const headers = (batch.detectedHeaders as string[]) || [];
  const mapping = (batch.appliedMappingJson as unknown) || null;

  return (
    <div className="space-y-6">
      <Link href="/admin/imports" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a importaciones
      </Link>

      <PageHeader
        title={batch.fileName}
        description={`${batch.totalRows} filas detectadas · ${headers.length} columnas`}
        actions={
          <Badge tone={batch.status === "COMPLETED" ? "success" : batch.status === "FAILED" ? "destructive" : "warning"}>
            {batch.status}
          </Badge>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><CardContent className="flex items-center gap-3 p-4"><Tag className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Marca: <span className="font-medium">{batch.brand?.name || "—"}</span></span></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><Truck className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Proveedor: <span className="font-medium">{batch.distributor?.name || "—"}</span></span></CardContent></Card>
        <Card><CardContent className="flex items-center gap-3 p-4"><FileSpreadsheet className="h-4 w-4 text-muted-foreground" /><span className="text-sm">Lista: <span className="font-medium">{batch.priceList?.name || "—"}</span></span></CardContent></Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Mapeo de columnas</h2>
          <p className="muted-text mb-4">
            Confirmá la equivalencia entre cada columna del Excel y el campo canónico. La IA o la heurística sugirieron una propuesta inicial.
          </p>
          <MappingEditor
            batchId={batch.id}
            headers={headers}
            mappingJson={mapping as unknown}
            canonicalFields={CANONICAL_FIELD_LIST}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="heading-3">Vista previa de filas</h2>
              <p className="muted-text text-sm">Mostrando hasta 50 filas de un total de {batch._count.rawProducts}.</p>
            </div>
            <ApproveAllButton batchId={batch.id} disabled={batch.status === "COMPLETED"} />
          </div>
          <div className="mt-4 overflow-x-auto">
            <Table>
              <THead>
                <TR>
                  <TH>Estado</TH>
                  <TH>SKU</TH>
                  <TH>Nombre normalizado</TH>
                  <TH>Costo</TH>
                  <TH>Original (raw)</TH>
                </TR>
              </THead>
              <TBody>
                {batch.rawProducts.map((row) => {
                  const norm = (row.normalizedJson as Record<string, unknown>) || {};
                  const raw = row.rawJson as Record<string, unknown>;
                  return (
                    <TR key={row.id}>
                      <TD>
                        <Badge tone={row.approvalStatus === "APPROVED" ? "success" : row.approvalStatus === "REJECTED" ? "destructive" : "muted"}>
                          {row.approvalStatus}
                        </Badge>
                      </TD>
                      <TD className="text-xs">{String(norm.sku || norm.supplierSku || "—")}</TD>
                      <TD className="text-xs">{String(norm.name || "—")}</TD>
                      <TD className="text-xs">{norm.baseCostUsd ? `USD ${norm.baseCostUsd}` : "—"}</TD>
                      <TD className="max-w-xs truncate text-xs text-muted-foreground" title={JSON.stringify(raw)}>
                        {JSON.stringify(raw).slice(0, 120)}
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
