"use server";

/** Edición de reglas de integración y especificaciones de sistema del Room Builder. */

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { ensureRoomBuilderSchema } from "@/services/room-builder/ensure-schema";
import { CONTROL_PLATFORMS, INTEGRATION_METHODS } from "@/services/room-builder/integrations";

export type RuleResult = { ok: true } | { ok: false; error: string };

const PATH = "/admin/room-builder/reglas";

const ruleSchema = z.object({
  id: z.string().max(64).optional(),
  brandSlug: z.string().regex(/^[a-z0-9-]{1,60}$/, "Elegí una marca"),
  productMatch: z.string().trim().max(80).nullable(),
  platform: z.enum(CONTROL_PLATFORMS),
  method: z.enum(INTEGRATION_METHODS),
  requirement: z.string().trim().max(400).nullable(),
  needsNetwork: z.boolean(),
  verified: z.boolean(),
  notes: z.string().trim().max(600).nullable(),
});

export type RuleInput = z.infer<typeof ruleSchema>;

const emptyToNull = (v: string | null) => (v && v.trim() ? v.trim() : null);

export async function saveIntegrationRule(input: RuleInput): Promise<RuleResult> {
  await requireAdmin();
  const parsed = ruleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  await ensureRoomBuilderSchema();
  const { id, ...rest } = parsed.data;
  const data = { ...rest, productMatch: emptyToNull(rest.productMatch), requirement: emptyToNull(rest.requirement), notes: emptyToNull(rest.notes) };
  try {
    if (id) await prisma.controlIntegration.update({ where: { id }, data });
    else await prisma.controlIntegration.create({ data });
  } catch (error) {
    console.error("[room-builder-rules] saveIntegrationRule", error);
    return { ok: false, error: "No se pudo guardar la regla" };
  }
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteIntegrationRule(id: string): Promise<RuleResult> {
  await requireAdmin();
  if (!id || id.length > 64) return { ok: false, error: "Regla inválida" };
  try {
    await prisma.controlIntegration.delete({ where: { id } });
  } catch (error) {
    console.error("[room-builder-rules] deleteIntegrationRule", error);
    return { ok: false, error: "No se pudo borrar la regla" };
  }
  revalidatePath(PATH);
  return { ok: true };
}

const specSchema = z.object({
  productId: z.string().min(1).max(64),
  kind: z.enum(["amplifier", "speaker", "streamer", "processor", "display", "switch", "other"]),
  channels: z.number().int().min(1).max(64).nullable(),
  wattsPerChannel: z.number().int().min(1).max(10000).nullable(),
  minOhms: z.number().min(1).max(32).nullable(),
  nominalOhms: z.number().min(1).max(32).nullable(),
  highImpedance: z.boolean(),
  streaming: z.boolean(),
  networked: z.boolean(),
  notes: z.string().trim().max(400).nullable(),
});

export type SpecInput = z.infer<typeof specSchema>;

/** Guarda la especificación a mano (pasa a source "manual" y gana sobre la automática). */
export async function saveSystemSpec(input: SpecInput): Promise<RuleResult> {
  await requireAdmin();
  const parsed = specSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  await ensureRoomBuilderSchema();
  const { productId, ...rest } = parsed.data;
  const data = { ...rest, notes: emptyToNull(rest.notes), source: "manual" };
  try {
    await prisma.productSystemSpec.upsert({ where: { productId }, create: { productId, ...data }, update: data });
  } catch (error) {
    console.error("[room-builder-rules] saveSystemSpec", error);
    return { ok: false, error: "No se pudo guardar la especificación" };
  }
  revalidatePath(PATH);
  return { ok: true };
}

/** Vuelve a la especificación automática (borra la cargada a mano). */
export async function resetSystemSpec(productId: string): Promise<RuleResult> {
  await requireAdmin();
  if (!productId || productId.length > 64) return { ok: false, error: "Producto inválido" };
  await prisma.productSystemSpec.deleteMany({ where: { productId } });
  revalidatePath(PATH);
  return { ok: true };
}
