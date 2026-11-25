import Link from "next/link";
import { requireStaff } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { AdminAssistantChat } from "@/components/expo/admin-assistant-chat";
import { suggestedQuestionsFor } from "@/server/assistant/suggestions";

export const dynamic = "force-dynamic";

export const metadata = { title: "Asistente de productos" };

export default async function AdminAssistantPage() {
  await requireStaff("products.view", { costs: true });
  const suggestions = await suggestedQuestionsFor("admin");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Asistente de productos"
        description="Consultas técnicas sobre el catálogo. Responde solo con datos de Soundtec: fichas, especificaciones y relaciones cargadas. Con tu sesión de admin puede además ver costo base y stock."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/admin/assistant/conversations" className="text-sm text-primary hover:underline">
              Conversaciones
            </Link>
            <Link href="/admin/assistant/leads" className="text-sm text-primary hover:underline">
              Leads
            </Link>
            <Link href="/admin/assistant/suggestions" className="text-sm text-primary hover:underline">
              Preguntas sugeridas
            </Link>
            <Link href="/admin/assistant/profiles" className="text-sm text-muted-foreground hover:underline">
              Perfiles de producto
            </Link>
          </div>
        }
      />
      <AdminAssistantChat suggestions={suggestions} />
    </div>
  );
}
