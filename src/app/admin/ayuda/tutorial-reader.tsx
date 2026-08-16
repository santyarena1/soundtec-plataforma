"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Compass } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TUTORIAL_DETAILED, TUTORIAL_SIMPLE, type TutorialArticle } from "@/lib/help/tutorial";

function ArticleList({ articles }: { articles: TutorialArticle[] }) {
  return (
    <div className="space-y-6">
      {articles.map((article) => (
        <section key={article.id} id={article.id} className="scroll-mt-6">
          <h2 className="text-lg font-semibold">{article.title}</h2>
          <p className="muted-text mt-0.5">{article.summary}</p>
          <div className="mt-3 space-y-3">
            {article.blocks.map((block) => (
              <Card key={block.title}>
                <CardContent className="p-4">
                  <h3 className="text-sm font-semibold">{block.title}</h3>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-foreground">
                    {block.body.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TutorialReader() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const version = searchParams.get("v") === "detallado" ? "detallado" : "simple";
  const articles = version === "detallado" ? TUTORIAL_DETAILED : TUTORIAL_SIMPLE;

  const toc = useMemo(() => articles.map((article) => ({ id: article.id, title: article.title })), [articles]);

  function setVersion(next: "simple" | "detallado") {
    const params = new URLSearchParams(searchParams.toString());
    params.set("v", next);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[220px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <div className="mb-3 flex gap-1 rounded-lg border border-border bg-card p-1">
          <button
            type="button"
            data-tour="help-simple"
            onClick={() => setVersion("simple")}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
              version === "simple" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Simple
          </button>
          <button
            type="button"
            data-tour="help-detailed"
            onClick={() => setVersion("detallado")}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium ${
              version === "detallado" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            Detallado
          </button>
        </div>
        <nav className="space-y-1">
          {toc.map((item) => (
            <a
              key={item.id}
              href={`#${item.id}`}
              className="block rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {item.title}
            </a>
          ))}
        </nav>
        <div className="mt-4 space-y-2">
          <ButtonLink href="/admin/quotes/new?tour=1" size="sm" variant="outline" className="w-full">
            <Compass className="h-3.5 w-3.5" />
            Recorrer alta de COT
          </ButtonLink>
          <ButtonLink href="/admin/settings/quotes?tour=1" size="sm" variant="outline" className="w-full">
            Recorrer configuración
          </ButtonLink>
          <p className="text-[11px] text-muted-foreground">
            En cualquier pantalla: botón Ayuda (abajo a la derecha) → Recorrer esta pantalla. Si algo falla, Reportar al
            dev.
          </p>
        </div>
      </aside>
      <ArticleList articles={articles} />
    </div>
  );
}
