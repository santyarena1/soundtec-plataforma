import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { startImportFromExcel } from "@/server/actions/imports";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Importaciones" };

export default async function AdminImportsPage() {
  await requireAdmin();
  const [batches, brands, distributors] = await Promise.all([
    prisma.importBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { priceList: { select: { name: true } } },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Importaciones de Excel"
        description="Subí archivos del proveedor o distribuidor. El sistema detecta columnas, sugiere mapeo y normaliza al modelo canónico."
      />

      <Card>
        <CardContent className="p-6">
          <h2 className="heading-3 mb-3">Nueva importación</h2>
          <form action={startImportFromExcel} encType="multipart/form-data" className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="priceListName" required>Nombre de la lista</Label>
              <Input id="priceListName" name="priceListName" required placeholder="Ej. Lista Shure - mayo 2026" />
            </div>
            <div>
              <Label htmlFor="brandId">Marca existente</Label>
              <Select id="brandId" name="brandId">
                <option value="">— ninguna —</option>
                {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="newBrandName">o crear marca nueva</Label>
              <Input id="newBrandName" name="newBrandName" placeholder="Ej. Crestron" />
            </div>
            <div>
              <Label htmlFor="distributorId">Distribuidor existente</Label>
              <Select id="distributorId" name="distributorId">
                <option value="">— ninguno —</option>
                {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
            </div>
            <div>
              <Label htmlFor="newDistributorName">o crear distribuidor nuevo</Label>
              <Input id="newDistributorName" name="newDistributorName" placeholder="Ej. ACME SA" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="file" required>Archivo Excel/CSV</Label>
              <Input id="file" name="file" type="file" accept=".xlsx,.xls,.csv" required />
            </div>
            <div className="sm:col-span-2 flex justify-end">
              <Button type="submit">Subir y analizar</Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {batches.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Archivo</TH>
              <TH>Lista</TH>
              <TH>Filas</TH>
              <TH>Procesadas</TH>
              <TH>Errores</TH>
              <TH>Estado</TH>
              <TH>Creada</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {batches.map((b) => (
              <TR key={b.id}>
                <TD className="font-medium">{b.fileName}</TD>
                <TD>{b.priceList?.name || "—"}</TD>
                <TD>{b.totalRows}</TD>
                <TD>{b.processedRows}</TD>
                <TD>{b.errorRows}</TD>
                <TD>
                  <Badge tone={b.status === "COMPLETED" ? "success" : b.status === "FAILED" ? "destructive" : "warning"}>
                    {b.status}
                  </Badge>
                </TD>
                <TD>{formatDate(b.createdAt)}</TD>
                <TD className="text-right">
                  <Link href={`/admin/imports/${b.id}`} className="text-sm text-accent hover:underline">
                    Abrir
                  </Link>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
