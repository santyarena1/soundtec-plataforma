import { SOUNDTEC_LOGO_PATH, cardError, cardImage, loadImageBytes, renderCard } from "@/lib/og/card";
import { findSharedProject } from "@/server/room-builder/share";

export const runtime = "nodejs";

/** Tarjeta del enlace de un proyecto para el cliente: logo de Soundtec y el nombre del proyecto (nunca precios). */
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  try {
    const project = await findSharedProject(token);
    if (!project) return new Response("No encontrado.", { status: 404 });
    const origin = req.url;
    return renderCard(
      {
        kind: "hero",
        eyebrow: "Proyecto",
        logo: await cardImage(await loadImageBytes(SOUNDTEC_LOGO_PATH, origin), { width: 260, height: 130 }),
        title: project.name,
        subtitle: "Planos, conexiones y equipos preparados por Soundtec",
      },
      { origin, seed: `project-${project.id}` },
    );
  } catch (error) {
    return cardError(error, `project/${token.slice(0, 6)}`);
  }
}
