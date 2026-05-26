"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { Sparkles, ThumbsDown, ThumbsUp, MessageSquare, Loader2, CheckCircle2 } from "lucide-react";
import { submitAiFeedback } from "@/server/actions/ai-feedback";
import type { AiFeedbackType, AiFeedbackVerdict } from "@prisma/client";

interface Props {
  entity: string;
  refId: string;
  type: AiFeedbackType;
  existingVerdict: AiFeedbackVerdict | null;
  existingComment: string | null;
}

export function AiContentNotice({ entity, refId, type, existingVerdict, existingComment }: Props) {
  const [pending, start] = useTransition();
  const [verdict, setVerdict] = useState<AiFeedbackVerdict | null>(existingVerdict);
  const [comment, setComment] = useState(existingComment || "");
  const [showCommentBox, setShowCommentBox] = useState(false);
  const [saved, setSaved] = useState(false);

  function submit(nextVerdict: AiFeedbackVerdict, withComment = false) {
    const formData = new FormData();
    formData.set("entity", entity);
    formData.set("refId", refId);
    formData.set("type", type);
    formData.set("verdict", nextVerdict);
    formData.set("comment", withComment ? comment : "");
    start(async () => {
      const result = await submitAiFeedback(formData);
      if (result?.ok) {
        setVerdict(nextVerdict);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
      }
    });
  }

  return (
    <div className="mt-3 rounded-md border border-accent/30 bg-accent/5 p-4">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-0.5 h-4 w-4 text-accent" />
        <div className="flex-1 space-y-3">
          <p className="text-sm">
            Esta información fue generada con inteligencia artificial. ¿Creés que la información es correcta?
          </p>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={verdict === "CORRECT" ? "primary" : "outline"}
              onClick={() => submit("CORRECT")}
              disabled={pending}
            >
              <ThumbsUp className="h-4 w-4" /> Sí, es correcta
            </Button>
            <Button
              type="button"
              size="sm"
              variant={verdict === "HAS_ERRORS" ? "destructive" : "outline"}
              onClick={() => submit("HAS_ERRORS")}
              disabled={pending}
            >
              <ThumbsDown className="h-4 w-4" /> Tiene errores
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setShowCommentBox((v) => !v)}
              disabled={pending}
            >
              <MessageSquare className="h-4 w-4" /> {showCommentBox ? "Cerrar comentario" : "Comentario libre"}
            </Button>
            {pending ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            {saved ? (
              <span className="inline-flex items-center gap-1 text-xs text-success">
                <CheckCircle2 className="h-3.5 w-3.5" /> Gracias por tu feedback.
              </span>
            ) : null}
          </div>

          {showCommentBox ? (
            <div className="space-y-2">
              <Label htmlFor="ai-comment">Comentario</Label>
              <Textarea
                id="ai-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Contanos qué corregirías..."
                rows={3}
              />
              <Button size="sm" disabled={pending || comment.length === 0} onClick={() => submit(verdict || "UNCLEAR", true)}>
                Enviar comentario
              </Button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
