import { ImpersonationBanner } from "@/components/impersonation/impersonation-banner";

/** Solo suma la franja de «Ver como» arriba (si hay una vista activa); cada página arma su pantalla. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <ImpersonationBanner />
      {children}
    </>
  );
}
