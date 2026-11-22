"use client";

import { SessionProvider } from "next-auth/react";
import { Toaster } from "sonner";
import { ConfirmHost } from "@/components/ui/confirm-dialog";
import { UnsavedChangesHost } from "@/components/unsaved-guard/unsaved-changes-host";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <Toaster position="bottom-right" richColors closeButton />
      <ConfirmHost />
      <UnsavedChangesHost />
    </SessionProvider>
  );
}
