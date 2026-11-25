import { notFound } from "next/navigation";
import { requireRoomProjectAccess } from "@/server/room-builder/access";
import { getRoomProject } from "@/services/room-builder";
import { RoomBuilderEditor } from "./editor-client";

export const dynamic = "force-dynamic";

export default async function RoomBuilderEditorPage({
  params,
}: {
  params: { id: string };
}) {
  await requireRoomProjectAccess(params.id);
  const project = await getRoomProject(params.id);
  if (!project) notFound();

  return (
    <RoomBuilderEditor
      initialProject={JSON.parse(JSON.stringify(project))}
    />
  );
}
