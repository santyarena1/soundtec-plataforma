import Link from "next/link";
import { QUOTE_STEPS } from "@/lib/quote-defaults";

export function QuoteWizardNav({ quoteId, step }: { quoteId: string; step: number }) {
  return (
    <nav className="overflow-x-auto">
      <ol className="flex min-w-max gap-1">
        {QUOTE_STEPS.map((s) => {
          const active = s.id === step;
          return (
            <li key={s.id}>
              <Link
                href={`/admin/quotes/${quoteId}?paso=${s.id}`}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm ${
                  active
                    ? "bg-[#1e3553] text-white"
                    : "border border-border bg-card text-foreground hover:bg-secondary"
                }`}
              >
                <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${active ? "bg-white/15" : "bg-secondary"}`}>
                  {s.id}
                </span>
                {s.title}
              </Link>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
