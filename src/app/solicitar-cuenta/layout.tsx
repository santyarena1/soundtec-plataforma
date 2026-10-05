import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";

export const metadata = { title: "Solicitar cuenta de cliente" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <PublicNavbar />
      <main className="container-page py-8 sm:py-10">{children}</main>
      <PublicFooter />
    </>
  );
}
