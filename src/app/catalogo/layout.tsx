import { cookies, headers } from "next/headers";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";
import { WelcomeScreen } from "@/components/expo/welcome-screen";
import { auth } from "@/lib/auth";
import { decideWelcome, isCrawlerUserAgent } from "@/lib/expo/welcome-gate";
import { LEAD_COOKIE, QR_COOKIE, SKIP_COOKIE, VISITOR_COOKIE } from "@/lib/expo/visitor-cookies";
import { findLiveQr, visitorHasLead } from "@/server/expo/visits";

export const metadata = {
  title: "Catálogo",
  description:
    "Catálogo público de Soundtec: productos de audio, video, control y videoconferencia de las marcas que representamos. Precios y stock disponibles para clientes con cuenta.",
};

export default async function PublicCatalogLayout({ children }: { children: React.ReactNode }) {
  const store = await cookies();
  const isCrawler = isCrawlerUserAgent((await headers()).get("user-agent"));
  const session = isCrawler ? null : await auth().catch(() => null);
  const qr = isCrawler ? null : await findLiveQr(store.get(QR_COOKIE)?.value).catch(() => null);
  const skipGate = isCrawler || !!session?.user;
  // El lead tiene que existir de verdad (no alcanza con la cookie); "Saltear" no cuenta.
  const hasLead = skipGate
    ? false
    : await visitorHasLead(store.get(LEAD_COOKIE)?.value, store.get(VISITOR_COOKIE)?.value).catch(() => false);
  const mode =
    skipGate
      ? "NONE"
      : decideWelcome({
          hasLead,
          skipped: store.get(SKIP_COOKIE)?.value === "1",
          qrEventLive: !!qr,
        });

  // El catálogo se renderiza siempre; la bienvenida va encima como overlay.
  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">{children}</main>
      <PublicFooter />
      {mode !== "NONE" ? <WelcomeScreen required={mode === "REQUIRED"} /> : null}
    </>
  );
}
