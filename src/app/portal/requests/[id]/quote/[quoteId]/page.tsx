import { redirect } from "next/navigation";

export const metadata = { title: "Cotización" };

/** El cliente no ve el documento HTML ni el editor: solo baja el PDF ya generado. */
export default async function PortalRequestQuotePage({
  params,
}: {
  params: Promise<{ id: string; quoteId: string }>;
}) {
  const { id, quoteId } = await params;
  redirect(`/api/portal/requests/${id}/quote-pdf/${quoteId}`);
}
