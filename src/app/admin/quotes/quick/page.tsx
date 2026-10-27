import { notFound } from "next/navigation";
import { requireQuotePermission } from "@/lib/quote-access";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { PageHeader } from "@/components/ui/page-header";
import { QuickQuoteForm, type QuickInitial } from "./quick-quote-form";
import { permissionsHave } from "@/lib/permissions";
import { listDocumentTypes } from "@/lib/quote-document-types";
import { QUOTE_AUDIENCES } from "@/lib/quote-audiences";
import { loadQuickQuoteForEdit } from "@/server/actions/quick-quote";

export const metadata = { title: "Admin · Cotización rápida" };

export default async function QuickQuotePage({ searchParams }: { searchParams: { editar?: string } }) {
  const { permissions } = await requireQuotePermission("quotes.create");
  const [clients, validity, owners, priceLists, defaultIva, defaultProfile, defaultTaxMode, documentTypes, editing] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, orderBy: { companyName: "asc" }, select: { id: true, companyName: true } }),
    getSetting(QUOTE_SETTING_KEYS.validityDays, "5"),
    prisma.user.findMany({ where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    getSetting(QUOTE_SETTING_KEYS.defaultIva, "21"),
    getSetting(QUOTE_SETTING_KEYS.defaultProfile, "resumido"),
    getSetting(QUOTE_SETTING_KEYS.defaultTaxMode, "NOTE"),
    listDocumentTypes(),
    searchParams.editar ? loadQuickQuoteForEdit(searchParams.editar) : Promise.resolve(null),
  ]);
  if (searchParams.editar && !editing) notFound();
  const initial: QuickInitial | null = editing
    ? { ...editing, taxMode: editing.taxMode === "ADDED" || editing.taxMode === "NONE" ? editing.taxMode : "NOTE" }
    : null;
  return (
    <div className="space-y-6">
      <PageHeader
        title={initial ? `Cotización rápida ${initial.number}` : "Cotización rápida"}
        description="Armá una cotización en una sola pantalla y generá el PDF para el cliente."
      />
      <QuickQuoteForm
        key={initial?.id ?? "nueva"}
        clients={clients.map((c) => ({ id: c.id, name: c.companyName }))}
        owners={owners}
        priceLists={priceLists}
        validityDays={Number(validity) || 5}
        canIssue={permissions.fullAccess || permissionsHave(permissions, "quotes.issue")}
        defaultIva={Number(defaultIva) || 21}
        defaults={{
          profileKey: documentTypes.some((t) => t.key === defaultProfile) ? defaultProfile : "resumido",
          taxMode: defaultTaxMode === "ADDED" || defaultTaxMode === "NONE" ? defaultTaxMode : "NOTE",
        }}
        documentTypes={documentTypes.map((t) => ({ key: t.key, name: t.name, audience: t.audience }))}
        audiences={QUOTE_AUDIENCES.map((a) => ({ key: a.key, label: a.label }))}
        initial={initial}
      />
    </div>
  );
}
