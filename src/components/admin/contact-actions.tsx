"use client";
import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { deleteClientContact, setPrimaryContact } from "@/server/actions/clients";
import { FieldError } from "@/components/ui/input";
export function ContactActions({
  id,
  clientId,
  isPrimary,
}: {
  id: string;
  clientId: string;
  isPrimary: boolean;
}) {
  const [pending, start] = useTransition(),
    [error, setError] = useState<string>();
  const router = useRouter();
  function run(fn: (f: FormData) => Promise<{ ok: boolean; error?: string }>) {
    const f = new FormData();
    f.set("id", id);
    f.set("clientId", clientId);
    start(async () => {
      const r = await fn(f);
      if (!r.ok) setError(r.error);
      router.refresh();
    });
  }
  return (
    <div>
      <div className="flex gap-1">
        {!isPrimary ? (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => run(setPrimaryContact)}
            disabled={pending}
          >
            Marcar principal
          </Button>
        ) : null}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => run(deleteClientContact)}
          disabled={pending}
        >
          Borrar
        </Button>
      </div>
      <FieldError message={error} />
    </div>
  );
}
