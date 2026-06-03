import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileEdit,
  Send,
  Eye,
  MessageSquare,
  CheckCircle2,
  XCircle,
  Lock,
  Circle,
} from "lucide-react";

type RequestStatus =
  | "DRAFT"
  | "SENT"
  | "IN_REVIEW"
  | "ANSWERED"
  | "CONFIRMED"
  | "REJECTED"
  | "CLOSED";

const STEPS: Array<{
  status: RequestStatus;
  label: string;
  icon: typeof Circle;
  description: string;
}> = [
  { status: "DRAFT", label: "Borrador", icon: FileEdit, description: "Armando tu solicitud" },
  { status: "SENT", label: "Enviada", icon: Send, description: "Llegó al equipo" },
  { status: "IN_REVIEW", label: "En revisión", icon: Eye, description: "Estamos cotizando" },
  { status: "ANSWERED", label: "Respondida", icon: MessageSquare, description: "Hay una propuesta" },
  { status: "CONFIRMED", label: "Confirmada", icon: CheckCircle2, description: "Pedido aprobado" },
];

const ORDER: Record<RequestStatus, number> = {
  DRAFT: 0,
  SENT: 1,
  IN_REVIEW: 2,
  ANSWERED: 3,
  CONFIRMED: 4,
  REJECTED: -1,
  CLOSED: -2,
};

interface Props {
  status: RequestStatus;
  updatedAt: Date;
}

export function RequestStatusTimeline({ status, updatedAt }: Props) {
  // Si el estado es REJECTED / CLOSED, mostramos un banner especial en lugar del stepper.
  if (status === "REJECTED") {
    return (
      <Card className="border-destructive/40 bg-destructive/5">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-destructive/15">
            <XCircle className="h-5 w-5 text-destructive" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Solicitud rechazada</p>
            <p className="text-xs text-muted-foreground">
              Mirá los comentarios del equipo más abajo para entender el motivo.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "CLOSED") {
    return (
      <Card className="border-muted bg-muted/30">
        <CardContent className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted-foreground/15">
            <Lock className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold">Solicitud cerrada</p>
            <p className="text-xs text-muted-foreground">
              Última actualización: {updatedAt.toLocaleDateString("es-AR")}
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentIdx = STEPS.findIndex((s) => s.status === status);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="hidden sm:flex items-start justify-between gap-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            const isFuture = i > currentIdx;
            return (
              <div key={step.status} className="flex-1 flex flex-col items-center text-center relative">
                {/* Línea conectora */}
                {i > 0 ? (
                  <div
                    className={`absolute top-5 right-1/2 h-0.5 w-full ${
                      i <= currentIdx ? "bg-primary" : "bg-border"
                    }`}
                  />
                ) : null}
                <div
                  className={`relative z-10 flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
                    isCurrent
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : isDone
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </div>
                <p
                  className={`mt-2 text-xs font-medium ${
                    isCurrent ? "text-foreground" : isDone ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {step.label}
                </p>
                {isCurrent ? (
                  <p className="mt-0.5 text-[10px] text-muted-foreground max-w-[100px] leading-tight">
                    {step.description}
                  </p>
                ) : null}
                {isFuture ? null : null}
              </div>
            );
          })}
        </div>

        {/* Versión mobile: vertical compacta */}
        <div className="sm:hidden space-y-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div key={step.status} className="flex items-center gap-3">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${
                    isCurrent
                      ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                      : isDone
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <div className="flex-1">
                  <p className={`text-sm font-medium ${isCurrent ? "text-foreground" : ""}`}>
                    {step.label}
                  </p>
                  {isCurrent ? (
                    <p className="text-[11px] text-muted-foreground">{step.description}</p>
                  ) : null}
                </div>
                {isCurrent ? <Badge tone="primary">Acá vas</Badge> : null}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

/** Re-exportamos solo el ORDER por si otra UI lo necesita. */
export { ORDER as REQUEST_STATUS_ORDER };
