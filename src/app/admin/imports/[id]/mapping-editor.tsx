"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { saveMapping } from "@/server/actions/imports";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save } from "lucide-react";

interface SuggestionItem {
  source: string;
  target: string | null;
  confidence?: number;
  rationale?: string;
}

interface Props {
  batchId: string;
  headers: string[];
  mappingJson: unknown;
  canonicalFields: readonly string[];
}

export function MappingEditor({ batchId, headers, mappingJson, canonicalFields }: Props) {
  const initial = useMemo(() => {
    const map: Record<string, string | null> = {};
    if (Array.isArray(mappingJson)) {
      // formato de SuggestionItem[]
      for (const it of mappingJson as SuggestionItem[]) {
        if (it && typeof it.source === "string") map[it.source] = it.target ?? null;
      }
    } else if (mappingJson && typeof mappingJson === "object") {
      Object.assign(map, mappingJson as Record<string, string | null>);
    }
    headers.forEach((h) => {
      if (!(h in map)) map[h] = null;
    });
    return map;
  }, [headers, mappingJson]);

  const [mapping, setMapping] = useState<Record<string, string | null>>(initial);
  const [pending, start] = useTransition();
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const router = useRouter();

  function setTarget(header: string, value: string) {
    setMapping((m) => ({ ...m, [header]: value || null }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const fd = new FormData();
    fd.set("batchId", batchId);
    fd.set("mappingJson", JSON.stringify(mapping));
    if (saveProfile && profileName) {
      fd.set("saveAsProfile", "on");
      fd.set("profileName", profileName);
    }
    start(async () => {
      const r = await saveMapping(fd);
      if (r?.ok) {
        setMsg("Mapeo guardado y filas pre-procesadas.");
        router.refresh();
      } else {
        setMsg(r?.error || "Error");
      }
    });
  }

  const suggestionByHeader = useMemo(() => {
    const map: Record<string, SuggestionItem | null> = {};
    if (Array.isArray(mappingJson)) {
      for (const it of mappingJson as SuggestionItem[]) {
        if (it?.source) map[it.source] = it;
      }
    }
    return map;
  }, [mappingJson]);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Table>
        <THead>
          <TR>
            <TH>Columna detectada</TH>
            <TH>Sugerencia</TH>
            <TH>Campo canónico</TH>
          </TR>
        </THead>
        <TBody>
          {headers.map((h) => {
            const suggestion = suggestionByHeader[h];
            return (
              <TR key={h}>
                <TD className="font-mono text-xs">{h}</TD>
                <TD className="text-xs text-muted-foreground">
                  {suggestion?.target ? (
                    <Badge tone="accent">
                      {suggestion.target} ({Math.round((suggestion.confidence || 0) * 100)}%)
                    </Badge>
                  ) : (
                    <Badge tone="muted">sin sugerencia</Badge>
                  )}
                </TD>
                <TD>
                  <Select
                    value={mapping[h] ?? ""}
                    onChange={(e) => setTarget(h, e.target.value)}
                    className="h-9 w-56 text-xs"
                  >
                    <option value="">(ignorar)</option>
                    {canonicalFields.map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </Select>
                </TD>
              </TR>
            );
          })}
        </TBody>
      </Table>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-end gap-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={saveProfile} onChange={(e) => setSaveProfile(e.target.checked)} />
            Guardar como perfil reutilizable
          </label>
          {saveProfile ? (
            <div>
              <Label htmlFor="profileName">Nombre del perfil</Label>
              <Input
                id="profileName"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Ej. Shure / AudioBrands"
                className="w-64"
              />
            </div>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {msg ? <span className="text-xs text-muted-foreground">{msg}</span> : null}
          <Button type="submit" disabled={pending}>
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar mapeo
          </Button>
        </div>
      </div>
    </form>
  );
}
