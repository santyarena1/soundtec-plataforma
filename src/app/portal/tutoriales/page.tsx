import { MonitorPlay } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { TutorialVideosGallery } from "@/components/tutorials/tutorial-videos-gallery";
import { getSetting } from "@/lib/settings";
import { formatDuration, parseTutorialVideos, TUTORIAL_VIDEOS_SETTING } from "@/lib/tutorial-videos";

export const metadata = { title: "Videos del portal" };
export const dynamic = "force-dynamic";

export default async function PortalTutorialsPage() {
  const videos = parseTutorialVideos(await getSetting(TUTORIAL_VIDEOS_SETTING, ""));
  const total = videos.reduce((acc, v) => acc + v.durationSeconds, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Videos del portal"
        description={
          videos.length
            ? `${videos.length} videos cortos para usar el portal: cómo pedir la cuenta, buscar en el catálogo, leer una ficha y más. ${formatDuration(total)} en total.`
            : "Videos cortos para usar el portal."
        }
      />
      {videos.length ? (
        <TutorialVideosGallery videos={videos} />
      ) : (
        <EmptyState
          icon={<MonitorPlay className="h-5 w-5" />}
          title="Todavía no hay videos cargados"
          description="Mientras tanto, probá el recorrido guiado desde «Tutorial online», arriba a la derecha."
        />
      )}
    </div>
  );
}
