import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD, TableEmpty } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { deleteShareablePriceList } from "@/server/actions/shareable-price-lists";
import { shareListPublicUrl } from "@/lib/shareable-price-list";
import { formatDate } from "@/lib/utils";
import { Link2, Plus } from "lucide-react";

export const metadata = { title: "Admin · Listas compartibles" };

const statusTone: Record<string, "success" | "muted" | "warning"> = {
  ACTIVE: "success",
  DRAFT: "muted",
  ARCHIVED: "warning",
};

const statusLabel: Record<string, string> = {
  ACTIVE: "Activa",
  DRAFT: "Borrador",
  ARCHIVED: "Archivada",
};

export default async function AdminShareListsPage() {
  await requireAdmin();
  const lists = await prisma.shareablePriceList.findMany({
    orderBy: { updatedAt: "desc" },
    include: { client: { select: { companyName: true } } },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Listas de precios compartibles"
        description="Armá listas filtrando productos, marcas, categorías y más. Compartí cada lista con un link único sin login."
        actions={
          <ButtonLink href="/admin/share-lists/new">
            <Plus className="h-4 w-4" /> Nueva lista
          </ButtonLink>
        }
      />

      {lists.length === 0 ? (
        <TableEmpty message="Todavía no creaste listas compartibles." />
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Lista</TH>
              <TH>Cliente precios</TH>
              <TH>Estado</TH>
              <TH>Vistas</TH>
              <TH>Actualizada</TH>
              <TH>Link</TH>
              <TH></TH>
            </TR>
          </THead>
          <TBody>
            {lists.map((l) => (
              <TR key={l.id}>
                <TD>
                  <Link href={`/admin/share-lists/${l.id}`} className="font-medium hover:text-accent">
                    {l.name}
                  </Link>
                  {l.description ? (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">{l.description}</p>
                  ) : null}
                </TD>
                <TD className="text-sm">{l.client?.companyName || "Estándar"}</TD>
                <TD>
                  <Badge tone={statusTone[l.status] || "muted"}>{statusLabel[l.status] || l.status}</Badge>
                </TD>
                <TD>{l.viewCount}</TD>
                <TD className="text-xs text-muted-foreground">{formatDate(l.updatedAt)}</TD>
                <TD>
                  <a
                    href={shareListPublicUrl(l.shareSlug)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                  >
                    <Link2 className="h-3 w-3" /> /lista/{l.shareSlug.slice(0, 8)}…
                  </a>
                </TD>
                <TD className="text-right">
                  <form action={deleteShareablePriceList} className="inline">
                    <input type="hidden" name="id" value={l.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-destructive">
                      Eliminar
                    </Button>
                  </form>
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
