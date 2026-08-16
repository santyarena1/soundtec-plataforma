import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select, Textarea } from "@/components/ui/input";
import { saveSetting } from "@/server/actions/settings";

/** Agrupa varios ajustes relacionados en una sola tarjeta, en lugar de una tarjeta por ajuste. */
export function SettingsCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {description ? <p className="muted-text mt-0.5">{description}</p> : null}
        </div>
        <div className="mt-2 divide-y divide-border/70">{children}</div>
      </CardContent>
    </Card>
  );
}

export interface SettingOption {
  value: string;
  label: string;
}

/**
 * Un `select` cuyo value no está entre las opciones muestra la primera opción,
 * así que el usuario podría sobrescribir el valor guardado sin verlo. Ante un
 * valor inesperado lo agregamos como opción explícita.
 */
export function withCurrentValueOption(options: SettingOption[], value: string): SettingOption[] {
  if (options.some((o) => o.value === value)) return options;
  return [{ value, label: value ? `${value} (valor actual)` : "Sin definir" }, ...options];
}

interface SettingFieldProps {
  settingKey: string;
  label: string;
  value: string;
  hint?: string;
  placeholder?: string;
  /** Guarda el valor cifrado y lo muestra enmascarado. */
  secret?: boolean;
  multiline?: boolean;
  /** Si se pasan opciones, el campo se renderiza como select. */
  options?: SettingOption[];
}

export function SettingField({
  settingKey,
  label,
  value,
  hint,
  placeholder,
  secret,
  multiline,
  options,
}: SettingFieldProps) {
  return (
    <form
      action={saveSetting}
      className="grid gap-2 py-4 first:pt-3 last:pb-0 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-3"
    >
      <input type="hidden" name="key" value={settingKey} />
      {secret ? <input type="hidden" name="isSecret" value="true" /> : null}

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Label htmlFor={settingKey}>{label}</Label>
          {secret ? (
            value ? (
              <Badge tone="success">configurada</Badge>
            ) : (
              <Badge tone="muted">vacía</Badge>
            )
          ) : null}
        </div>
        {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}

        {options ? (
          <Select id={settingKey} name="value" defaultValue={value} className="mt-1.5">
            {withCurrentValueOption(options, value).map((o) => (
              <option key={o.value || "__empty"} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        ) : multiline ? (
          <Textarea
            id={settingKey}
            name="value"
            rows={4}
            defaultValue={value}
            placeholder={placeholder}
            className="mt-1.5"
          />
        ) : (
          <Input
            id={settingKey}
            name="value"
            type={secret ? "password" : "text"}
            defaultValue={value}
            placeholder={secret && value ? maskSecret(value) : placeholder}
            className="mt-1.5"
          />
        )}
      </div>

      <Button type="submit" variant="outline" size="sm">
        Guardar
      </Button>
    </form>
  );
}

function maskSecret(value: string) {
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 4)}••••${value.slice(-4)}`;
}
