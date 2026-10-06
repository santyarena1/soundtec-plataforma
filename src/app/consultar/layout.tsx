import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";

/** Consulta por marca: fuera del catálogo para no mostrar encima la bienvenida (esta página ya es el formulario). */
export default function InquiryLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">{children}</main>
      <PublicFooter />
    </>
  );
}
