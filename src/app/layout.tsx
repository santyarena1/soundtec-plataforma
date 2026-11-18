import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { getSetting } from "@/lib/settings";
import { ogMeta, siteCardUrl } from "@/lib/og/meta";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

function resolveMetadataBase(): URL | undefined {
  const raw = (process.env.APP_URL || "").trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return undefined;
  try {
    const url = new URL(raw);
    // Si queda en localhost, Next convierte /favicon.ico en
    // http://localhost:3000/favicon.ico y el ícono se rompe en producción.
    if (/^(localhost|127\.0\.0\.1)$/i.test(url.hostname)) return undefined;
    return url;
  } catch {
    return undefined;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  let appName = "Soundtec";
  try {
    appName = (await getSetting("app.name", "Soundtec")) || "Soundtec";
  } catch {
    // fallback silencioso si la DB no está disponible
  }

  // Nunca usar el logo de marca (puede ser data: de hasta ~500KB) como page icon:
  // inflaba el HTML de todas las páginas. Íconos fijos en /public.
  // Vista previa al pegar un enlace (WhatsApp, redes): la tarjeta general con la red de puntos,
  // el logo y las marcas. Las páginas con tarjeta propia (producto, marca, lista, formulario) la reemplazan.
  const ogImage = siteCardUrl("home");
  const ogDescription = "Audio, video, control y automatización para proyectos integrados. Catálogo con ficha técnica de todas nuestras marcas.";
  const metadataBase = resolveMetadataBase();

  return {
    title: {
      default: `${appName} — Soluciones audiovisuales profesionales`,
      template: `%s | ${appName}`,
    },
    description:
      "Integración profesional de audio, video, iluminación, videoconferencia, automatización y control inteligente para proyectos corporativos, educativos, culturales y de eventos.",
    ...(metadataBase ? { metadataBase } : {}),
    icons: {
      icon: [
        { url: "/favicon.ico", sizes: "any" },
        { url: "/icon-192.png", type: "image/png", sizes: "192x192" },
        { url: "/icon-512.png", type: "image/png", sizes: "512x512" },
      ],
      shortcut: "/favicon.ico",
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
    },
    ...ogMeta({ title: `${appName} — Soluciones audiovisuales profesionales`, description: ogDescription, image: ogImage }),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover",
  // El sitio es solo claro, aunque el teléfono esté en modo oscuro. «only light» solo no alcanzaba:
  // hay navegadores y vistas web de Android que oscurecen la página salvo que declare tener tema
  // oscuro. Por eso la raíz declara «light dark» (así nadie la oscurece por su cuenta) y en
  // globals.css el body fija «only light» con los colores claros de siempre (controles nativos
  // incluidos). Lo verifica e2e/force-dark.spec.ts con el oscurecido automático de Chrome.
  colorScheme: "light dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={inter.variable} style={{ colorScheme: "light dark" }} suppressHydrationWarning>
      <body className="min-h-dvh bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
