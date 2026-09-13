"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, ExternalLink, FileText, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatProduct, ChatSource, ChatTurn } from "./types";

function ProductCard({ product }: { product: ChatProduct }) {
  return (
    <Link
      href={product.href}
      className="group flex items-center gap-3 rounded-xl border border-border bg-card p-3 transition-all duration-200 hover:border-accent hover:shadow-card active:scale-[0.99]"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-secondary">
        {product.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={product.imageUrl}
            alt=""
            className="h-full w-full object-contain"
            loading="lazy"
            width={56}
            height={56}
          />
        ) : (
          <FileText className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {product.brandName ? (
          <p className="truncate text-[11px] font-semibold uppercase tracking-wide text-accent">
            {product.brandName}
          </p>
        ) : null}
        <p className="line-clamp-2 text-sm font-medium leading-snug text-foreground">{product.name}</p>
        {product.reason ? (
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{product.reason}</p>
        ) : null}
      </div>
      <ExternalLink
        className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-accent"
        aria-hidden="true"
      />
    </Link>
  );
}

function SourceList({ sources }: { sources: ChatSource[] }) {
  const [open, setOpen] = useState(false);
  if (sources.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground transition-colors hover:border-accent hover:text-foreground"
        aria-expanded={open}
      >
        <Info className="h-3 w-3" aria-hidden="true" />
        {open ? "Ocultar fuentes" : `Ver fuentes (${sources.length})`}
        <ChevronDown
          className={cn("h-3 w-3 transition-transform duration-200", open && "rotate-180")}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <ul className="ai-enter mt-2 space-y-1.5">
          {sources.map((source, index) => {
            const label = `${source.productName} — ${source.title}${
              source.page ? ` · pág. ${source.page}` : ""
            }`;
            return (
              <li key={`${source.productId}-${index}`} className="text-[11px] leading-relaxed text-muted-foreground">
                <span className="text-foreground">•</span>{" "}
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
                {source.detail ? <span className="text-muted-foreground"> · {source.detail}</span> : null}
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

export function ChatMessage({
  turn,
  onSuggestion,
}: {
  turn: ChatTurn;
  onSuggestion: (value: string) => void;
}) {
  if (turn.role === "user") {
    return (
      <div className="ai-enter flex justify-end">
        <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm text-primary-foreground">
          {turn.content}
        </p>
      </div>
    );
  }

  return (
    <div className="ai-enter space-y-3">
      <div
        className={cn(
          "max-w-[95%] rounded-2xl rounded-bl-sm px-4 py-3 text-sm leading-relaxed",
          turn.error ? "bg-warning/10 text-foreground" : "bg-secondary text-secondary-foreground"
        )}
      >
        <p className="whitespace-pre-wrap">{turn.content}</p>
        {turn.sources && turn.sources.length > 0 ? <SourceList sources={turn.sources} /> : null}
      </div>

      {turn.products && turn.products.length > 0 ? (
        <div className="ai-stagger space-y-2">
          {turn.products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      ) : null}

      {turn.suggestions && turn.suggestions.length > 0 ? (
        <div className="ai-stagger flex flex-wrap gap-2">
          {turn.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-all duration-200 hover:border-accent hover:text-foreground active:scale-95"
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
