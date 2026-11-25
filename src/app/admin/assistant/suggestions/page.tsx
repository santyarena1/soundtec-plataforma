import Link from "next/link";
import { requirePermission } from "@/lib/auth-helpers";
import { PageHeader } from "@/components/ui/page-header";
import { defaultQuestions } from "@/lib/assistant-suggestions";
import { loadSuggestedQuestions } from "@/server/assistant/suggestions";
import { SuggestionsEditor } from "./suggestions-editor";

export const dynamic = "force-dynamic";

export const metadata = { title: "Preguntas sugeridas del asistente" };

export default async function AssistantSuggestionsPage() {
  await requirePermission("settings.manage");
  const saved = await loadSuggestedQuestions();

  return (
    <div className="space-y-5">
      <PageHeader
        title="Preguntas sugeridas"
        description="Los botones que ofrece Soundtec AI antes de escribir, en la Expo, el catálogo público, el portal y el admin."
        actions={
          <Link href="/admin/assistant" className="text-sm text-primary hover:underline">
            Volver al asistente
          </Link>
        }
      />
      <SuggestionsEditor initial={saved ?? defaultQuestions()} usingDefaults={!saved} />
    </div>
  );
}
