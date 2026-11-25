"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth-helpers";
import { CONDITIONS_COOKIE, CONDITIONS_COOKIE_MAX_AGE } from "@/lib/client-conditions";

/** «Activá tus descuentos»: prende o apaga los precios con las condiciones de la empresa en este navegador. */
export async function setConditionsPrices(on: boolean): Promise<{ ok: true }> {
  const user = await requireUser();
  const store = await cookies();
  if (on) {
    store.set(CONDITIONS_COOKIE, user.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: CONDITIONS_COOKIE_MAX_AGE,
    });
  } else {
    store.delete(CONDITIONS_COOKIE);
  }
  revalidatePath("/portal", "layout");
  return { ok: true };
}
