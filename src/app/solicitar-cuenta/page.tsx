import { getAccountRequestPrefill } from "@/server/expo/account-prefill";
import { AccountRequestForm } from "./account-request-form";
import { ogMeta, siteCardUrl } from "@/lib/og/meta";

export const metadata = {
  title: "Pedí tu cuenta",
  ...ogMeta({ title: "Pedí tu cuenta en Soundtec", description: "Precios de distribuidor, pedidos y cotizaciones en un solo lugar.", image: siteCardUrl("solicitar") }),
};

export const dynamic = "force-dynamic";

export default async function SolicitarCuentaPage() {
  const prefill = await getAccountRequestPrefill();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Solicitar cuenta de cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Para integradores, instaladores, estudios y comercios del rubro. Con la cuenta ves los precios para tu empresa y armás pedidos y cotizaciones.
      </p>
      <AccountRequestForm prefill={prefill} />
    </div>
  );
}
