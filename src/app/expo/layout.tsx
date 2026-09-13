import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Asistente Soundtec",
  description: "Consultá especificaciones, compatibilidad y aplicaciones de los productos de Soundtec.",
  robots: { index: false, follow: false },
};

/**
 * La experiencia de Expo ocupa la pantalla completa: sin navbar ni footer
 * públicos, porque se usa parada, en un teléfono y con una sola mano.
 */
export default function ExpoLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
