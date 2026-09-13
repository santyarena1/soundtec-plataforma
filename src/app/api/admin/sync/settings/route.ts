import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth-helpers";
import { getSetting, setSetting } from "@/lib/settings";

const targetSchema = z.enum(["categoria", "familia", "rubro", "subrubro"]);
const sourceSchema = z.object({
  username: z.string().max(300),
  password: z.string().max(500).optional(),
  categoryTarget: targetSchema,
  translations: z.record(z.string(), z.string().max(500)),
});
const soundtubeSchema = z.object({
  priceField: z.enum(["pricelevel1", "pricelevel30", "onlinecustomerprice"]),
  categoryTarget: targetSchema,
  translations: z.record(z.string(), z.string().max(500)),
});
const settingsSchema = z.object({ crestron: sourceSchema, sonance: sourceSchema, soundtube: soundtubeSchema.optional() });
const SOUNDTUBE_KEYS = { priceField: "soundtube.price_field", target: "soundtube.category_target", translations: "soundtube.category_translations" } as const;

const KEYS = {
  crestron: { username: "crestron.username", password: "crestron.password", target: "crestron.category_target", translations: "crestron.category_translations" },
  sonance: { username: "sonance.portal_username", password: "sonance.portal_password", target: "sonance.category_target", translations: "sonance.category_translations" },
} as const;

function parseTranslations(value: string): Record<string, string> {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch { return {}; }
}

export async function GET() {
  await requireAdmin();
  const response: Record<string, unknown> = {};
  for (const source of ["crestron", "sonance"] as const) {
    const keys = KEYS[source];
    const [username, password, categoryTarget, translations] = await Promise.all([
      getSetting(keys.username), getSetting(keys.password), getSetting(keys.target, "rubro"), getSetting(keys.translations, "{}"),
    ]);
    response[source] = { username, passwordConfigured: Boolean(password), categoryTarget, translations: parseTranslations(translations) };
  }
  const [stPrice, stTarget, stTranslations] = await Promise.all([
    getSetting(SOUNDTUBE_KEYS.priceField, "pricelevel1"),
    getSetting(SOUNDTUBE_KEYS.target, "categoria"),
    getSetting(SOUNDTUBE_KEYS.translations, "{}"),
  ]);
  response.soundtube = { priceField: stPrice, categoryTarget: stTarget, translations: parseTranslations(stTranslations) };
  return NextResponse.json({ ok: true, settings: response });
}

export async function POST(request: NextRequest) {
  await requireAdmin();
  const parsed = settingsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Configuración inválida." }, { status: 400 });
  for (const source of ["crestron", "sonance"] as const) {
    const value = parsed.data[source];
    const keys = KEYS[source];
    await Promise.all([
      setSetting(keys.username, value.username),
      value.password ? setSetting(keys.password, value.password, { isSecret: true }) : Promise.resolve(),
      setSetting(keys.target, value.categoryTarget),
      setSetting(keys.translations, JSON.stringify(value.translations)),
    ]);
  }
  if (parsed.data.soundtube) {
    const st = parsed.data.soundtube;
    await Promise.all([
      setSetting(SOUNDTUBE_KEYS.priceField, st.priceField),
      setSetting(SOUNDTUBE_KEYS.target, st.categoryTarget),
      setSetting(SOUNDTUBE_KEYS.translations, JSON.stringify(st.translations)),
    ]);
  }
  return NextResponse.json({ ok: true });
}
