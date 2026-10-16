import { requireStaff } from "@/lib/auth-helpers";
import { PlanWizard } from "@/components/room-builder/plan/plan-wizard";

export const dynamic = "force-dynamic";

export default async function PlanProjectPage() {
  await requireStaff("room_builder.use");
  return <PlanWizard />;
}
