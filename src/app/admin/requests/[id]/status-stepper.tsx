import { Card, CardContent } from "@/components/ui/card";
import { REQUEST_FLOW, REQUEST_STATUS_META, type RequestStatus } from "@/lib/request-status";

const STEP_HINT: Record<string, string> = {
  SENT: "Llegó al equipo",
  IN_REVIEW: "La estamos cotizando",
  ANSWERED: "Propuesta enviada",
  CONFIRMED: "Acuerdo cerrado",
};

/** Dónde está parada la solicitud dentro del recorrido, para ubicarse de un vistazo. */
export function StatusStepper({ status }: { status: RequestStatus }) {
  const meta = REQUEST_STATUS_META[status];

  if (status === "REJECTED" || status === "CLOSED" || status === "DRAFT") {
    const Icon = meta.icon;
    const tone =
      status === "REJECTED"
        ? { card: "border-destructive/40 bg-destructive/5", chip: "bg-destructive/15 text-destructive" }
        : { card: "border-border bg-muted/30", chip: "bg-muted-foreground/15 text-muted-foreground" };
    return (
      <Card className={tone.card}>
        <CardContent className="flex items-center gap-3 p-4 pt-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${tone.chip}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold">Solicitud {meta.label.toLowerCase()}</p>
            <p className="text-xs text-muted-foreground">{meta.adminHint}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const currentIdx = REQUEST_FLOW.indexOf(status);

  return (
    <Card>
      <CardContent className="p-5 pt-5">
        <div className="flex items-start justify-between gap-2">
          {REQUEST_FLOW.map((step, i) => {
            const stepMeta = REQUEST_STATUS_META[step];
            const Icon = stepMeta.icon;
            const isDone = i < currentIdx;
            const isCurrent = i === currentIdx;
            return (
              <div key={step} className="relative flex flex-1 flex-col items-center text-center">
                {i > 0 ? (
                  <div className={`absolute right-1/2 top-5 h-0.5 w-full ${i <= currentIdx ? "bg-primary" : "bg-border"}`} />
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
                <p className={`mt-2 text-xs font-medium ${isCurrent || isDone ? "text-foreground" : "text-muted-foreground"}`}>
                  {stepMeta.label}
                </p>
                <p className="mt-0.5 max-w-[110px] text-[10px] leading-tight text-muted-foreground">{STEP_HINT[step]}</p>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
