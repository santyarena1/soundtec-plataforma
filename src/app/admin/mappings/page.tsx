import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";

export const metadata = { title: "Admin · Mapeos" };

export default async function MappingsPage() {
  await requireAdmin();
  const profiles = await prisma.columnMappingProfile.findMany({
    orderBy: { updatedAt: "desc" },
    include: { brand: { select: { name: true } }, distributor: { select: { name: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Perfiles de mapeo"
        description="Los perfiles se generan al guardar un mapeo durante una importación. Se reutilizan automáticamente para futuras cargas del mismo proveedor/marca."
      />
      {profiles.length === 0 ? (
        <TableEmpty message="Todavía no hay perfiles. Subí un Excel y guardá el mapeo como perfil reutilizable." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Nombre</TH>
              <TH>Marca</TH>
              <TH>Distribuidor</TH>
              <TH>Tipo</TH>
              <TH>Actualizado</TH>
            </TR>
          </THead>
          <TBody>
            {profiles.map((p) => (
              <TR key={p.id}>
                <TD className="font-medium">{p.name}</TD>
                <TD>{p.brand?.name || "—"}</TD>
                <TD>{p.distributor?.name || "—"}</TD>
                <TD>{p.sourceType}</TD>
                <TD>{formatDate(p.updatedAt)}</TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
