"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MessagesSquare, Send, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { adminSendRequestMessage } from "@/server/actions/requests";
import type { QuoteMessageAttachment } from "@/lib/request-quote-link";

export interface ConversationMessage {
  id: string;
  message: string;
  senderName: string;
  fromClient: boolean;
  isAiGenerated: boolean;
  sentAtLabel: string;
  quoteAttachments?: QuoteMessageAttachment[];
}

interface Props {
  requestId: string;
  messages: ConversationMessage[];
  clientName: string;
}

export function RequestConversation({ requestId, messages, clientName }: Props) {
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  function send() {
    const message = text.trim();
    if (!message) {
      toast.error("Escribí un mensaje antes de enviar.");
      return;
    }
    start(async () => {
      const r = await adminSendRequestMessage({ requestId, message });
      if (r.ok) {
        setText("");
        toast.success("Mensaje enviado", { description: `${clientName} lo ve en su portal.` });
        router.refresh();
      } else {
        toast.error(r.error || "No se pudo enviar el mensaje.");
      }
    });
  }

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border py-8 text-center">
          <MessagesSquare className="h-7 w-7 text-muted-foreground/30" />
          <p className="text-sm text-muted-foreground">Todavía no hay mensajes</p>
          <p className="text-xs text-muted-foreground/70">Escribí abajo para arrancar la conversación.</p>
        </div>
      ) : (
        <div className="max-h-[420px] space-y-3 overflow-y-auto pr-1">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.fromClient ? "justify-start" : "justify-end"}`}>
              <div
                className={`max-w-[85%] rounded-lg border px-3 py-2 ${
                  m.fromClient ? "border-border bg-secondary/50" : "border-primary/20 bg-primary/5"
                }`}
              >
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">{m.fromClient ? m.senderName : `${m.senderName} · Soundtec`}</span>
                  {m.isAiGenerated ? (
                    <Badge tone="accent">
                      <Sparkles className="h-3 w-3" /> IA
                    </Badge>
                  ) : null}
                  <span className="ml-auto shrink-0">{m.sentAtLabel}</span>
                </div>
                <p className="mt-1 whitespace-pre-wrap text-sm">{m.message}</p>
                {m.quoteAttachments?.length ? (
                  <div className="mt-2 space-y-1">
                    {m.quoteAttachments.map((att) => (
                      <div key={att.quoteId} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <a
                          href={`/admin/quotes/${att.quoteId}`}
                          className="text-xs font-medium text-accent hover:underline"
                        >
                          Abrir editor {att.number}
                        </a>
                        <a
                          href={att.pdfUrl.startsWith("http") ? att.pdfUrl : `/api/quotes/${att.quoteId}/pdf`}
                          className="text-xs font-medium text-muted-foreground hover:underline"
                        >
                          Descargar PDF
                        </a>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      <div className="border-t border-border pt-3">
        <Textarea
          rows={3}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              send();
            }
          }}
          placeholder={`Escribile a ${clientName}…`}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Todo lo que escribas acá lo ve el cliente. Atajo: Ctrl + Enter para enviar.
          </p>
          <Button size="sm" onClick={send} disabled={pending || !text.trim()}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Enviar
          </Button>
        </div>
      </div>
    </div>
  );
}
