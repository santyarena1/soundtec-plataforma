import { prisma } from "@/lib/prisma";
import { readSettings } from "@/lib/forms/types";
import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";

export const runtime = "nodejs";

/** Datos del evento que se muestran abajo del logo, en este orden de preferencia. */
const DETAIL_LABELS = /^(fecha|d[ií]a|horario|hora|lugar|sal[oó]n|sede)$/i;

/**
 * Imagen que aparece al compartir el enlace de un formulario: la red de puntos
 * de los formularios, el logo del evento grande al centro y la fecha, el
 * horario y el lugar (los de «Información útil» de la confirmación).
 */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return new Response("No encontrado.", { status: 404 });
  try {
    const form = await prisma.form.findUnique({ where: { token }, select: { title: true, settings: true } });
    if (!form) return new Response("No encontrado.", { status: 404 });
    const settings = readSettings(form.settings);
    const details = (settings.endInfo ?? [])
      .filter((d) => DETAIL_LABELS.test(d.label.trim()) && d.value.trim())
      .map((d) => d.value.trim());
    const origin = req.url;
    const customLogo = settings.logoUrl || settings.welcomeImageUrl;
    // Logos propios: desde el almacenamiento (/api/files) o rutas del sitio; se limpia el fondo blanco del JPG.
    const bytes = await loadImageBytes(customLogo || SOUNDTEC_LOGO_PATH, origin);
    return renderCard(
      {
        kind: "hero",
        logo: customLogo ? await cardImage(bytes, { width: 820, height: 250 }, { clean: true }) : await cardImage(bytes, { width: 260, height: 140 }),
        // Con logo propio el nombre ya está en la imagen: abajo van los datos. Sin logo, el título grande.
        title: customLogo ? undefined : settings.welcomeTitle?.trim() || form.title,
        details,
      },
      { origin, seed: token }
    );
  } catch (error) {
    return cardError(error, `form/${token}`);
  }
}
