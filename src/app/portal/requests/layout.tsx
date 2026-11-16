import { redirect } from "next/navigation";
import { CUSTOMER_ORDERS_ENABLED } from "@/lib/customer-orders";

/** Pedidos del portal apagados (src/lib/customer-orders.ts): cualquier ruta de pedidos vuelve al inicio. */
export default function PortalRequestsLayout({ children }: { children: React.ReactNode }) {
  if (!CUSTOMER_ORDERS_ENABLED) redirect("/portal");
  return <>{children}</>;
}
