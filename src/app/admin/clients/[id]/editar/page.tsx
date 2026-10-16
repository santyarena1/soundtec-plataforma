import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { permissionsHave } from "@/lib/permissions";
import { PageHeader } from "@/components/ui/page-header";
import { ClientEditor } from "@/components/admin/client-editor";
import { canAccessClient, seesAllClients } from "@/server/clients/access";
import { conditionsGroupId } from "@/server/clients/conditions";
import { loadClientEditorOptions } from "@/server/clients/editor-options";

export const metadata = { title: "Admin · Editar cliente" };

export default async function EditClientPage({ params }: { params: { id: string } }) {
  const ctx = await requireStaff("clients.edit");
  if (!(await canAccessClient(ctx, params.id))) redirect("/admin/clients");
  const [client, options, discounts, otherRules] = await Promise.all([
    prisma.client.findUnique({ where: { id: params.id } }),
    loadClientEditorOptions(),
    prisma.discountRule.findMany({ where: { groupId: conditionsGroupId(params.id) }, orderBy: { priority: "desc" } }),
    prisma.discountRule.count({ where: { clientId: params.id, NOT: { groupId: conditionsGroupId(params.id) } } }),
  ]);
  if (!client) notFound();
  const canCommercial = permissionsHave(ctx.permissions, "clients.commercial");
  return (
    <div className="space-y-6">
      <Link href={`/admin/clients/${client.id}`} className="text-sm text-muted-foreground">
        ← Volver a la ficha
      </Link>
      <PageHeader title={`Editar ${client.companyName}`} description="Contactos y accesos al portal se manejan desde la ficha." />
      {canCommercial && otherRules > 0 ? (
        <p className="rounded-md border border-border bg-secondary/40 p-3 text-xs text-muted-foreground">
          Además tiene {otherRules} regla(s) de descuento avanzadas (por producto, familia, etc.) que se editan en la ficha → Precios.
        </p>
      ) : null}
      <ClientEditor
        {...options}
        initial={{
          id: client.id,
          companyName: client.companyName,
          tradeName: client.tradeName,
          taxId: client.taxId,
          taxCondition: client.taxCondition,
          segment: client.segment,
          source: client.source,
          website: client.website,
          ownerId: client.ownerId,
          tags: client.tags,
          address: client.address,
          city: client.city,
          province: client.province,
          postalCode: client.postalCode,
          country: client.country,
          notes: client.notes,
          paymentTerms: client.paymentTerms,
          creditLimitUsd: client.creditLimitUsd != null ? Number(client.creditLimitUsd) : null,
          assignedPriceListId: client.assignedPriceListId,
          discounts: discounts.map((d) => ({
            target: d.scopeType === "BRAND" ? "BRAND" : d.scopeType === "CATEGORY" ? "CATEGORY" : "ALL",
            targetId: d.scopeId,
            percent: Number(d.discountPercent),
          })),
        }}
        canCommercial={canCommercial}
        canPortal={false}
        canChooseOwner={seesAllClients(ctx.permissions)}
        currentUserId={ctx.user.id}
      />
    </div>
  );
}
