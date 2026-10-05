import { cookies } from "next/headers";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";
import { WelcomeScreen } from "@/components/expo/welcome-screen";
import { auth } from "@/lib/auth";
import { eventStatus } from "@/lib/expo/event-status";
import { decideWelcome } from "@/lib/expo/welcome-gate";
import { LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE } from "@/lib/expo/visitor-cookies";
import { findQrWithEvent } from "@/server/expo/visits";

export const metadata = {
  title: "Catálogo",
  description:
    "Catálogo público de Soundtec: productos de audio, video, control y videoconferencia de las marcas que representamos. Precios y stock disponibles para clientes con cuenta.",
};

export default async function PublicCatalogLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const session = await auth().catch(() => null);
  const qr = await findQrWithEvent(store.get(QR_COOKIE)?.value).catch(() => null);
  const mode = session?.user
    ? "NONE"
    : decideWelcome({
        hasLead: !!store.get(LEAD_COOKIE)?.value,
        skipped: store.get(SKIP_COOKIE)?.value === "1",
        qrEventLive: !!qr && eventStatus(qr.event) === "LIVE",
      });

  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">
        {mode === "NONE" ? children : <WelcomeScreen required={mode === "REQUIRED"} />}
      </main>
      <PublicFooter />
    </>
  );
}
