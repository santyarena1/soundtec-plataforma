import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({ title, description, actions, className }: PageHeaderProps) {
  return (
    <div
      data-tour="page-header"
      className={cn("flex flex-col gap-3 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between", className)}
    >
      <div>
        <h1 className="heading-2">{title}</h1>
        {description ? <p className="muted-text mt-1 max-w-2xl">{description}</p> : null}
      </div>
      {actions ? (
        <div data-tour="page-actions" className="flex flex-wrap items-center gap-2">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
