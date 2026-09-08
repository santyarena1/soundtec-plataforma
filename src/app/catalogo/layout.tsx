import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";

export const metadata = {
  title: "Catálogo",
  description:
    "Catálogo público de Soundtec: productos de audio, video, control y videoconferencia de las marcas que representamos. Precios y stock disponibles para clientes con cuenta.",
};

export default function PublicCatalogLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">{children}</main>
      <PublicFooter />
    </>
  );
}
