"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { submitAiFeedback } from "@/server/actions/ai-feedback";
import type { AiFeedbackType, AiFeedbackVerdict } from "@prisma/client";

const REASONS = [
  ["specs_wrong", "Especificaciones incorrectas"],
  ["wrong_product", "Describe otro producto"],
  ["price_or_availability", "Precio o disponibilidad"],
  ["compatibility", "Compatibilidad / accesorios"],
  ["language", "Redacción o idioma"],
  ["missing_info", "Falta información"],
  ["other", "Otro"],
] as const;

export function AiContentNotice({
  entity,
  refId,
  type,
  existingVerdict,
  existingComment,
  existingIssues = [],
  generatedText,
}: {
  entity: string;
  refId: string;
  type: AiFeedbackType;
  existingVerdict: AiFeedbackVerdict | null;
  existingComment: string | null;
  existingIssues?: string[];
  generatedText: string;
}) {
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState(!existingVerdict);
  const [reporting, setReporting] = useState(existingVerdict === "HAS_ERRORS");
  const [verdict, setVerdict] = useState(existingVerdict);
  const [issues, setIssues] = useState<string[]>(existingIssues);
  const [comment, setComment] = useState(existingComment || "");
  const [error, setError] = useState("");

  function send(next: AiFeedbackVerdict) {
    if (next === "HAS_ERRORS" && issues.includes("other") && !comment.trim()) {
      setError("Contanos qué corregirías cuando elegís Otro.");
      return;
    }
    const form = new FormData();
    form.set("entity", entity);
    form.set("refId", refId);
    form.set("type", type);
    form.set("verdict", next);
    form.set("comment", next === "HAS_ERRORS" ? comment : "");
    form.set("generatedText", generatedText);
    issues.forEach((issue) => form.append("issues", issue));
    start(async () => {
      const result = await submitAiFeedback(form);
      if (result.ok) {
        setVerdict(next);
        setEditing(false);
        setReporting(next === "HAS_ERRORS");
        setError("");
      } else setError(result.error || "No pudimos enviar el reporte.");
    });
  }

  if (verdict && !editing)
    return (
      <div className="mt-3 rounded-md border border-success/30 bg-success/5 p-4 text-sm">
        <p className="font-medium">Gracias, ya recibimos tu reporte.</p>
        {verdict === "HAS_ERRORS" ? (
          <p className="mt-1 text-muted-foreground">
            {issues
              .map((i) => REASONS.find(([key]) => key === i)?.[1])
              .filter(Boolean)
              .join(" · ")}
            {comment ? ` — ${comment}` : ""}
          </p>
        ) : null}
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(true)}>
          Editar reporte
        </Button>
      </div>
    );

  return (
    <div className="mt-3 space-y-3 rounded-md border border-accent/30 bg-accent/5 p-4">
      <p className="text-sm">
        Esta información fue generada con inteligencia artificial. ¿Creés que es correcta?
      </p>
      <div className="flex gap-2">
        <Button size="sm" type="button" onClick={() => send("CORRECT")} disabled={pending}>
          Sí, es correcta
        </Button>
        <Button
          size="sm"
          type="button"
          variant="destructive"
          onClick={() => setReporting(true)}
          disabled={pending}
        >
          Tiene errores
        </Button>
      </div>
      {reporting ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div className="grid gap-2 sm:grid-cols-2">
            {REASONS.map(([key, label]) => (
              <label key={key} className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={issues.includes(key)}
                  onChange={() =>
                    setIssues((old) =>
                      old.includes(key) ? old.filter((i) => i !== key) : [...old, key],
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder="Contanos qué corregirías"
          />
          <Button type="button" size="sm" onClick={() => send("HAS_ERRORS")} disabled={pending}>
            Enviar reporte
          </Button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
