import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getSetting } from "@/lib/settings";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export async function generateMetadata(): Promise<Metadata> {
  let appName = "Soundtec";
  let logoUrl = "";
  try {
    const [name, logo] = await Promise.all([
      getSetting("app.name", "Soundtec"),
      getSetting("branding.logo_url", ""),
    ]);
    appName = name || "Soundtec";
    logoUrl = logo || "";
  } catch {
    // fallback silencioso si la DB no está disponible
  }

  // Nunca usar el logo de marca (puede ser data: de hasta ~500KB) como page icon:
  // inflaba el HTML de todas las páginas y el browser pedía /favicon.ico en 404.
  // app/icon.svg + public/favicon.ico cubren el ícono de pestaña.
  const ogImage =
    logoUrl && /^https?:\/\//i.test(logoUrl) ? [logoUrl] : undefined;

  return {
    title: {
      default: `${appName} — Soluciones audiovisuales profesionales`,
      template: `%s | ${appName}`,
    },
    description:
      "Integración profesional de audio, video, iluminación, videoconferencia, automatización y control inteligente para proyectos corporativos, educativos, culturales y de eventos.",
    metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
    icons: {
      icon: [{ url: "/favicon.ico" }, { url: "/icon.svg", type: "image/svg+xml" }],
      shortcut: "/favicon.ico",
      apple: "/favicon.ico",
    },
    openGraph: {
      title: appName,
      description:
        "Portal de clientes y herramientas profesionales para proyectos audiovisuales integrados.",
      type: "website",
      locale: "es_AR",
      images: ogImage,
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
