"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Loader2, Save } from "lucide-react";
import { saveBulkSettings } from "@/server/actions/settings";

interface Props {
  prompts: {
    longDescription: string;
    shortDescription: string;
    classification: string;
    columnMapping: string;
    requestResponse: string;
  };
}

const FIELDS: { key: keyof Props["prompts"]; settingKey: string; label: string; hint: string }[] = [
  {
    key: "longDescription",
    settingKey: "ai.prompt.long_description",
    label: "Descripción larga",
    hint: "Se usa al generar la descripción técnica larga del producto. Variables disponibles: {name}, {brand}, {category}, {short}.",
  },
  {
    key: "shortDescription",
    settingKey: "ai.prompt.short_description",
    label: "Descripción corta",
    hint: "Se usa al generar el resumen corto del producto. Variables disponibles: {name}, {brand}, {category}.",
  },
  {
    key: "classification",
    settingKey: "ai.prompt.classification",
    label: "Clasificación de producto",
    hint: "Se usa para sugerir marca, rubro y subrubro a partir del nombre del producto.",
  },
  {
    key: "columnMapping",
    settingKey: "ai.prompt.column_mapping",
    label: "Mapeo de columnas (importación)",
    hint: "Se usa para mapear columnas de un archivo de importación a los campos del sistema.",
  },
  {
    key: "requestResponse",
    settingKey: "ai.prompt.request_response",
    label: "Respuesta a solicitudes",
    hint: "Se usa para generar respuestas sugeridas a solicitudes de clientes.",
  },
];

export function AiPromptsForm({ prompts }: Props) {
  const [values, setValues] = useState({ ...prompts });
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  function handleSave() {
    setSaved(false);
    start(async () => {
      const input: Record<string, string> = {};
      for (const f of FIELDS) {
        input[f.settingKey] = values[f.key];
      }
      await saveBulkSettings(input);
      setSaved(true);
    });
  }

  return (
    <div className="space-y-6">
      {FIELDS.map((f) => (
        <div key={f.key}>
          <Label htmlFor={`prompt-${f.key}`}>{f.label}</Label>
          <p className="mb-1.5 text-[11px] text-muted-foreground">{f.hint}</p>
          <Textarea
            id={`prompt-${f.key}`}
            rows={6}
            value={values[f.key]}
            onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
            placeholder="(Dejar vacío para usar el prompt por defecto del sistema)"
          />
        </div>
      ))}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Guardar prompts
        </Button>
        {saved && <span className="text-sm text-success">Guardado correctamente.</span>}
      </div>
    </div>
  );
}
