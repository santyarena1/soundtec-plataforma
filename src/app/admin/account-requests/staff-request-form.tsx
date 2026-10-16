"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea, FieldHint } from "@/components/ui/input";
import { ACTIVITY_OPTIONS } from "@/lib/expo/account-request-schema";
import { submitStaffAccountRequest } from "@/server/actions/account-requests";

/** Pedido de alta de una empresa nueva, cargado por un vendedor. Lo aprueba un admin. */
export function StaffRequestForm({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(defaultOpen);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [activity, setActivity] = useState<string>("");

  if (!open) {
    return <Button onClick={() => setOpen(true)}>Pedir alta de empresa</Button>;
  }
  if (done) {
    return (
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="font-semibold">Listo, la solicitud quedó pendiente.</p>
          <p className="text-sm text-muted-foreground">
            Cuando un administrador la apruebe, la empresa queda como tu cliente y la persona recibe su acceso al portal por mail.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              setDone(false);
              router.refresh();
            }}
          >
            Pedir otra
          </Button>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="p-5">
        <form
          className="space-y-4"
          autoComplete="off"
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const text = (k: string) => String(f.get(k) ?? "").trim();
            const discount = text("proposedDiscountPercent").replace(",", ".");
            start(async () => {
              setError(null);
              const r = await submitStaffAccountRequest({
                company: text("company"),
                cuit: text("cuit"),
                fullName: text("fullName"),
                email: text("email"),
                phone: text("phone"),
                activity: text("activity") as (typeof ACTIVITY_OPTIONS)[number],
                activityOther: text("activityOther") || null,
                location: text("location") || null,
                website: text("website") || null,
                comment: text("comment") || null,
                proposedDiscountPercent: discount ? Number(discount) : null,
                staffNote: text("staffNote") || null,
              });
              if (!r.ok) return setError(r.error);
              setDone(true);
              router.refresh();
            });
          }}
        >
          <div>
            <h2 className="font-semibold">Pedir alta de empresa</h2>
            <p className="text-xs text-muted-foreground">Para un cliente nuevo tuyo. Un administrador la revisa y la aprueba.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label required>Empresa (razón social)</Label>
              <Input name="company" required autoComplete="off" />
            </div>
            <div>
              <Label required>CUIT</Label>
              <Input name="cuit" required inputMode="numeric" placeholder="30-12345678-9" autoComplete="off" />
            </div>
            <div>
              <Label required>Actividad</Label>
              <Select name="activity" required value={activity} onChange={(e) => setActivity(e.target.value)}>
                <option value="">Elegí…</option>
                {ACTIVITY_OPTIONS.map((a) => (
                  <option key={a}>{a}</option>
                ))}
              </Select>
            </div>
            {activity === "Otra" ? (
              <div>
                <Label required>¿A qué se dedica?</Label>
                <Input name="activityOther" required />
              </div>
            ) : null}
            <div>
              <Label>Ciudad / provincia</Label>
              <Input name="location" autoComplete="off" />
            </div>
            <div>
              <Label>Sitio web</Label>
              <Input name="website" placeholder="https://" autoComplete="off" />
            </div>
          </div>
          <fieldset className="grid gap-3 rounded-md border border-border p-3 sm:grid-cols-3">
            <legend className="px-1 text-sm font-medium">Persona que va a usar el portal</legend>
            <div>
              <Label required>Nombre y apellido</Label>
              <Input name="fullName" required autoComplete="off" />
            </div>
            <div>
              <Label required>Email</Label>
              <Input name="email" type="email" required autoComplete="off" data-1p-ignore data-lpignore="true" />
            </div>
            <div>
              <Label required>Teléfono</Label>
              <Input name="phone" required inputMode="tel" autoComplete="off" />
            </div>
          </fieldset>
          <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
            <div>
              <Label>Descuento propuesto</Label>
              <div className="flex items-center gap-1">
                <Input name="proposedDiscountPercent" inputMode="decimal" placeholder="0" />
                <span className="text-sm">%</span>
              </div>
              <FieldHint>El admin lo confirma.</FieldHint>
            </div>
            <div>
              <Label>Nota para el admin</Label>
              <Textarea name="staffNote" rows={2} placeholder="Volumen esperado, condiciones habladas, de dónde viene…" />
            </div>
          </div>
          <div>
            <Label>Comentario de la empresa</Label>
            <Textarea name="comment" rows={2} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Enviando…" : "Enviar solicitud"}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
