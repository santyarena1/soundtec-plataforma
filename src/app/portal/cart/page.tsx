import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth-helpers";
import { getOrCreateActiveDraft } from "@/lib/draft-request";

/** El carrito pasó a ser la solicitud en borrador. */
export default async function CartRedirectPage() {
  const user = await requireUser();
  const draft = await getOrCreateActiveDraft(user.id, { migrateLegacyCart: true });
  redirect(`/portal/requests/${draft.id}`);
}
