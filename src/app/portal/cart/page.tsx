import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { getOrCreateActiveDraft } from "@/lib/draft-request";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";

/** El carrito pasó a ser el pedido en borrador. */
export default async function CartRedirectPage() {
  // Pedidos apagados: no se crea un borrador, se vuelve al inicio.
  if (!CUSTOMER_ORDERS_ENABLED) redirect("/portal");
  const user = await requireUser();
  const draft = await getOrCreateActiveDraft(user.id, { migrateLegacyCart: true });
  redirect(`/portal/requests/${draft.id}`);
}
