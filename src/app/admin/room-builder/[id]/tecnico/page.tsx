import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth-helpers";
import { getRoomProject } from "@/services/room-builder";
import { TechnicalModule } from "./technical-client";

export const dynamic = "force-dynamic";

/** Módulo técnico del proyecto: conexionado de puerto a puerto y plano de cables. */
export default async function RoomBuilderTechnicalPage({ params }: { params: { id: string } }) {
  await requireAdmin();
  const project = await getRoomProject(params.id);
  if (!project) notFound();
  return <TechnicalModule initialProject={JSON.parse(JSON.stringify(project))} />;
}
