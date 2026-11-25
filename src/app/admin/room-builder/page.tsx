import { requireStaff } from "@/lib/auth-helpers";
import { RoomBuilderHome } from "./_client";

export const dynamic = "force-dynamic";

export default async function RoomBuilderPage() {
  const { isAdmin } = await requireStaff("room_builder.use");
  // Las estadísticas de enriquecimiento son solo de admins: el vendedor no las pide (antes dejaba un 401 en consola).
  return <RoomBuilderHome canEnrich={isAdmin} />;
}
