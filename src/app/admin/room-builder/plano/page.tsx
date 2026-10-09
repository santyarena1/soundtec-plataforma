import { requireAdmin } from "@/lib/auth-helpers";
import { PlanWizard } from "@/components/room-builder/plan/plan-wizard";

export const dynamic = "force-dynamic";

export default async function PlanProjectPage() {
  await requireAdmin();
  return <PlanWizard />;
}
