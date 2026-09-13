import { redirect } from "next/navigation";

/**
 * La vista de impresión era un segundo documento, hecho en React, que no
 * coincidía con el PDF que recibía el cliente: otra tabla, otros totales y sin
 * las condiciones comerciales. Ahora esta ruta lleva al documento real, que es
 * el único que existe.
 */
export default async function QuotePrintPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/api/admin/quotes/${id}/preview-pdf`);
}
