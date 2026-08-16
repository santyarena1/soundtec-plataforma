"use client";

import { useEffect, useRef } from "react";
import { ensureQuoteProductShortDescriptions } from "@/server/actions/quote-ai";

export function FillMissingShortDescriptions({ quoteId, needed }: { quoteId: string; needed: boolean }) {
  const ran = useRef(false);

  useEffect(() => {
    if (!needed || ran.current) return;
    ran.current = true;
    void ensureQuoteProductShortDescriptions(quoteId);
  }, [needed, quoteId]);

  return null;
}
