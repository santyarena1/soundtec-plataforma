import { requireStaff } from "@/lib/auth-helpers";
import { RoomWizard } from "@/components/room-builder/wizard/room-wizard";

export const dynamic = "force-dynamic";

export default async function NewRoomPage() {
  await requireStaff("room_builder.use");
  return <RoomWizard />;
}
