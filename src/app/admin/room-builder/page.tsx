import { requireAdmin } from "@/lib/auth-helpers";
import { RoomBuilderHome } from "./_client";

export const dynamic = "force-dynamic";

export default async function RoomBuilderPage() {
  await requireAdmin();
  return <RoomBuilderHome />;
}
