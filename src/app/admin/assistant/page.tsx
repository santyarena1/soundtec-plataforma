import Link from "next/link";
import { requireAdmin } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { AdminAssistantChat } from "@/components/expo/admin-assistant-chat";

export const dynamic = "force-dynamic";

export const metadata = { title: "Asistente de productos" };

export default async function AdminAssistantPage() {
  await requireAdmin();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asistente de productos"
        description="Consultas técnicas sobre el catálogo. Responde solo con datos de Soundtec: fichas, especificaciones y relaciones cargadas. Con tu sesión de admin puede además ver costo base y stock."
        actions={
          <Link href="/admin/assistant/leads" className="text-sm text-primary hover:underline">
            Ver leads y conversaciones
          </Link>
        }
      />
      <AdminAssistantChat />
    </div>
  );
}
