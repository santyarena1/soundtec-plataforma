import { redirect } from "next/navigation";

/** La lista de SoundTube se carga en una sola pantalla: Revisión SoundTube. */
export default function SoundTubePricesRedirect() {
  redirect("/admin/soundtube-review");
}
