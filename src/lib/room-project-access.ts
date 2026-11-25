// Quién puede abrir, editar o compartir una sala/proyecto del Room Builder.
// Mismo criterio que las cotizaciones: el dueño, o quien ve las de todos (admins, «Ver las cotizaciones de todos»).

export interface RoomProjectOwnership {
  ownerId: string;
  /** Dueño del proyecto (hub) cuando es un ambiente de un proyecto multi-ambiente. */
  parentOwnerId?: string | null;
}

export function canAccessRoomProject(
  project: RoomProjectOwnership,
  viewer: { userId: string; permissions: { scopes: string[]; fullAccess?: boolean } }
): boolean {
  if (viewer.permissions.fullAccess) return true;
  if (viewer.permissions.scopes.includes("quotes.view_all")) return true;
  return project.ownerId === viewer.userId || (project.parentOwnerId != null && project.parentOwnerId === viewer.userId);
}
