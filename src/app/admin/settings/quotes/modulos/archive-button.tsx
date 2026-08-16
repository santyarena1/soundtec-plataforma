"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { archiveLibraryModule } from "@/server/actions/quote-modules";

export function ArchiveLibraryModule({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      className="h-7 text-[11px]"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const result = await archiveLibraryModule({ id });
          if (!result.ok) {
            toast.error(result.error || "No se pudo archivar.");
            return;
          }
          toast.success("Borrador archivado. Las COT que ya lo usan no se tocan.");
          router.refresh();
        })
      }
    >
      Archivar
    </Button>
  );
}
