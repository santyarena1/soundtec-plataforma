"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Sparkles, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Label, Select } from "@/components/ui/input";

type Target = "categoria" | "familia" | "rubro" | "subrubro";
type SourceValue = { username: string; password: string; passwordConfigured: boolean; categoryTarget: Target; translations: Record<string, string> };
type Settings = { crestron: SourceValue; sonance: SourceValue };
const EMPTY: SourceValue = { username: "", password: "", passwordConfigured: false, categoryTarget: "rubro", translations: {} };

export function SourceSettings() {
  const [settings, setSettings] = useState<Settings>({ crestron: { ...EMPTY }, sonance: { ...EMPTY } });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => { void (async () => {
    try {
      const response = await fetch("/api/admin/sync/settings", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo cargar la configuración.");
      setSettings({
        crestron: { ...EMPTY, ...data.settings.crestron },
        sonance: { ...EMPTY, ...data.settings.sonance },
      });
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo cargar la configuración."); }
    finally { setLoading(false); }
  })(); }, []);

  function update(source: keyof Settings, patch: Partial<SourceValue>) {
    setSettings((current) => ({ ...current, [source]: { ...current[source], ...patch } }));
    setMessage(null);
  }
  async function save() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/admin/sync/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo guardar.");
      setSettings((current) => ({
        crestron: { ...current.crestron, password: "", passwordConfigured: current.crestron.passwordConfigured || Boolean(current.crestron.password) },
        sonance: { ...current.sonance, password: "", passwordConfigured: current.sonance.passwordConfigured || Boolean(current.sonance.password) },
      }));
      setMessage("Configuración guardada.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  }
  async function translate(source: keyof Settings) {
    const items = Object.keys(settings[source].translations).filter((key) => key.trim());
    if (!items.length) { setMessage("Agregá al menos una categoría original para traducir."); return; }
    setTranslating(source); setMessage(null);
    try {
      const endpoint = source === "crestron" ? "/api/admin/crestron-sync/translate" : "/api/admin/sonance-import/translate";
      const response = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ items }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || "No se pudo traducir.");
      update(source, { translations: { ...settings[source].translations, ...data.translations } });
    } catch (error) { setMessage(error instanceof Error ? error.message : "No se pudo traducir."); }
    finally { setTranslating(null); }
  }

  return <Card><CardContent className="space-y-5 p-5">
    <div><h2 className="heading-3">Configuración de fuentes</h2><p className="mt-0.5 text-xs text-muted-foreground">Credenciales y categorías de los portales clásicos. Las contraseñas nunca se muestran.</p></div>
    {loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Cargando configuración…</p> : (
      <div className="grid gap-5 lg:grid-cols-2">{(["crestron", "sonance"] as const).map((source) => {
        const value = settings[source];
        const entries = Object.entries(value.translations);
        return <div key={source} className="space-y-4 rounded-md border border-border p-4">
          <div><h3 className="font-medium">{source === "crestron" ? "Crestron (Xtrabone)" : "Sonance"}</h3><p className="text-xs text-muted-foreground">Contraseña configurada: {value.passwordConfigured ? "sí" : "no"}</p>{source === "crestron" ? <a href="/admin/products?crestronMissing=1" className="mt-1 inline-block text-xs font-medium text-accent hover:underline">Ver productos sin ficha en crestron.com</a> : null}</div>
          <div><Label>Usuario</Label><Input value={value.username} onChange={(event) => update(source, { username: event.target.value })} /></div>
          <div><Label>Nueva contraseña</Label><Input type="password" autoComplete="new-password" placeholder={value.passwordConfigured ? "Dejá vacío para conservarla" : "Ingresá la contraseña"} value={value.password} onChange={(event) => update(source, { password: event.target.value })} /></div>
          <div><Label>Destino de categoría</Label><Select value={value.categoryTarget} onChange={(event) => update(source, { categoryTarget: event.target.value as Target })}><option value="categoria">Categoría</option><option value="familia">Familia</option><option value="rubro">Rubro</option><option value="subrubro">Subrubro</option></Select></div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2"><Label>Traducciones EN → ES</Label><Button type="button" size="sm" variant="outline" onClick={() => update(source, { translations: { ...value.translations, "": "" } })}><Plus className="mr-1 h-3.5 w-3.5" />Agregar</Button></div>
            {entries.length === 0 ? <p className="text-xs text-muted-foreground">No hay traducciones guardadas.</p> : entries.map(([original, translated], index) => <div key={`${original}-${index}`} className="grid grid-cols-[1fr_1fr_auto] gap-2">
              <Input aria-label="Categoría original" placeholder="Original en inglés" value={original} onChange={(event) => { const next = { ...value.translations }; delete next[original]; next[event.target.value] = translated; update(source, { translations: next }); }} />
              <Input aria-label="Traducción" placeholder="Traducción" value={translated} onChange={(event) => update(source, { translations: { ...value.translations, [original]: event.target.value } })} />
              <Button type="button" size="sm" variant="ghost" aria-label="Borrar traducción" onClick={() => { const next = { ...value.translations }; delete next[original]; update(source, { translations: next }); }}><Trash2 className="h-4 w-4" /></Button>
            </div>)}
            <Button type="button" size="sm" variant="outline" disabled={translating === source} onClick={() => void translate(source)}>{translating === source ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Sparkles className="mr-1 h-3.5 w-3.5" />}Traducir con IA</Button>
          </div>
        </div>;
      })}</div>
    )}
    <div className="flex items-center justify-end gap-3">{message && <p className="text-xs text-muted-foreground">{message}</p>}<Button disabled={loading || saving} onClick={() => void save()}>{saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}{saving ? "Guardando…" : "Guardar configuración"}</Button></div>
  </CardContent></Card>;
}
