import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { deleteColumnMappingProfile, startImportFromExcel } from "@/server/actions/imports";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Importaciones" };

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Pendiente", MAPPING: "Mapeo", REVIEWING: "En revisión",
  COMPLETED: "Completada", FAILED: "Fallida", CANCELLED: "Cancelada",
};

export default async function AdminImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; distributorId?: string }>;
}) {
  await requireAdmin();
  const filters = await searchParams;
  const status = filters.status && Object.hasOwn(STATUS_LABELS, filters.status) ? filters.status : undefined;
  const [batches, brands, distributors, profiles] = await Promise.all([
    prisma.importBatch.findMany({
      where: {
        status: status as never,
        distributorId: filters.distributorId || undefined,
      },
      orderBy: { createdAt: "desc" },
      take: 30,
      include: { priceList: { select: { name: true } }, distributor: { select: { name: true } } },
    }),
    prisma.brand.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.distributor.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.columnMappingProfile.findMany({
      orderBy: { updatedAt: "desc" },
      include: { brand: { select: { name: true } }, distributor: { select: { name: true } } },
    }),
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
              <Label htmlFor="distributorId">Proveedor existente</Label>
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

      <Card>
        <CardContent className="p-5 space-y-4">
          <div>
            <h2 className="heading-3">Perfiles de mapeo guardados</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Se reutilizan automáticamente cuando coinciden la marca o el proveedor y las columnas del archivo.
            </p>
          </div>
          {profiles.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no guardaste ningún perfil.</p>
          ) : (
            <div className="divide-y divide-border rounded-md border border-border">
              {profiles.map((profile) => (
                <div key={profile.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{profile.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {profile.distributor?.name || "Sin proveedor"} · {profile.brand?.name || "Sin marca"} · {formatDate(profile.updatedAt)}
                    </p>
                  </div>
                  <form action={deleteColumnMappingProfile}>
                    <input type="hidden" name="profileId" value={profile.id} />
                    <Button type="submit" size="sm" variant="outline">Borrar</Button>
                  </form>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-md border border-border p-4">
        <div>
          <Label htmlFor="status">Estado</Label>
          <Select id="status" name="status" defaultValue={filters.status || ""}>
            <option value="">Todos</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </div>
        <div>
          <Label htmlFor="filterDistributorId">Proveedor</Label>
          <Select id="filterDistributorId" name="distributorId" defaultValue={filters.distributorId || ""}>
            <option value="">Todos</option>
            {distributors.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </Select>
        </div>
        <Button type="submit" variant="outline">Filtrar</Button>
      </form>

      {batches.length === 0 ? (
        <TableEmpty />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Archivo</TH>
              <TH>Lista</TH>
              <TH>Proveedor</TH>
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
                <TD>{b.distributor?.name || "—"}</TD>
                <TD>{b.totalRows}</TD>
                <TD>{b.processedRows}</TD>
                <TD>{b.errorRows}</TD>
                <TD>
                  <Badge tone={b.status === "COMPLETED" ? "success" : b.status === "FAILED" ? "destructive" : "warning"}>
                    {STATUS_LABELS[b.status] ?? b.status}
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
