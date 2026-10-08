import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRoomProject } from "@/services/room-builder";
import { RoomBuilderEditor } from "./editor-client";

export const dynamic = "force-dynamic";

export default async function RoomBuilderEditorPage({
  params,
}: {
  params: { id: string };
}) {
  await requireAdmin();
  const project = await getRoomProject(params.id);
  if (!project) notFound();

  return (
    <RoomBuilderEditor
      initialProject={JSON.parse(JSON.stringify(project))}
    />
  );
}
