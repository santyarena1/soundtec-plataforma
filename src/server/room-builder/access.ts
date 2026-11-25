import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth-helpers";
import { canAccessRoomProject } from "@/lib/room-project-access";

export const ROOM_PROJECT_NOT_FOUND = "Proyecto no encontrado.";

/**
 * Staff con Room Builder, y si puede tocar ESTE proyecto (dueño o «ver todo»).
 * Un proyecto inexistente cuenta como permitido: la ruta o acción da su propio «no encontrado».
 */
export async function checkRoomProjectAccess(projectId: string) {
  const staff = await requireStaff("room_builder.use");
  const row =
    typeof projectId === "string" && projectId
      ? await prisma.roomProject.findUnique({
          where: { id: projectId },
          select: { ownerId: true, parent: { select: { ownerId: true } } },
        })
      : null;
  const allowed =
    !row ||
    canAccessRoomProject({ ownerId: row.ownerId, parentOwnerId: row.parent?.ownerId }, { userId: staff.user.id, permissions: staff.permissions });
  return { ...staff, allowed };
}

/** Para rutas y pantallas: un proyecto ajeno responde como inexistente (404). */
export async function requireRoomProjectAccess(projectId: string) {
  const { allowed, ...staff } = await checkRoomProjectAccess(projectId);
  if (!allowed) notFound();
  return staff;
}
