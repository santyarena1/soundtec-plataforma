import { requireQuotePermission } from "@/lib/quote-access";
import { prisma } from "@/lib/prisma";
import { getSetting } from "@/lib/settings";
import { QUOTE_SETTING_KEYS } from "@/lib/quote-settings";
import { PageHeader } from "@/components/ui/page-header";
import { QuickQuoteForm } from "./quick-quote-form";

export const metadata = { title: "Admin · Cotización rápida" };

export default async function QuickQuotePage() {
  await requireQuotePermission("quotes.create");
  const [clients, requests, validity, owners, priceLists] = await Promise.all([
    prisma.client.findMany({
      where: { isActive: true },
      orderBy: { companyName: "asc" },
      select: { id: true, companyName: true },
    }),
    prisma.customerRequest.findMany({
      where: { status: { in: ["SENT", "IN_REVIEW"] } },
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: { id: true, clientId: true, projectDescription: true },
    }),
    getSetting(QUOTE_SETTING_KEYS.validityDays, "5"),
    prisma.user.findMany({
      where: { role: { in: ["ADMIN", "SUPER_ADMIN"] }, isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.priceList.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader
        title="Cotización rápida"
        description="Armá, guardá o emití una cotización en una sola pantalla."
      />
      <QuickQuoteForm
        clients={clients.map((c) => ({ id: c.id, name: c.companyName }))}
        owners={owners}
        priceLists={priceLists}
        validityDays={Number(validity) || 5}
        requests={requests.map((r) => ({
          id: r.id,
          clientId: r.clientId,
          label:
            (r.projectDescription || "Pedido").slice(0, 60) +
            " · #" +
            r.id.slice(-6).toUpperCase(),
        }))}
      />
    </div>
  );
}
