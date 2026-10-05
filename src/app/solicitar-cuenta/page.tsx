import { getAccountRequestPrefill } from "@/server/actions/account-requests";
import { AccountRequestForm } from "./account-request-form";

export const dynamic = "force-dynamic";

export default async function SolicitarCuentaPage() {
  const prefill = await getAccountRequestPrefill();
  return (
    <div className="mx-auto max-w-xl">
      <h1 className="text-2xl font-semibold">Solicitar cuenta de cliente</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Con tu cuenta vas a ver precios, stock y podés armar cotizaciones. La revisamos y te avisamos.
      </p>
      <AccountRequestForm prefill={prefill} />
    </div>
  );
}
