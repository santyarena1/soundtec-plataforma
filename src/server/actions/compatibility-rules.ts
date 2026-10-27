"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { describeRule, ruleWhere } from "@/lib/compatibility-rules";

const ruleSchema = z
  .object({
    productId: z.string().min(1),
    categoryId: z.string().min(1).nullable(),
    brandId: z.string().min(1).nullable(),
    line: z.string().trim().max(80).nullable(),
  })
  .refine((r) => r.categoryId || r.brandId || r.line, { message: "Elegí al menos un rubro, una marca o una línea." });

type RuleView = { id: string; label: string; count: number };

async function view(productId: string): Promise<RuleView[]> {
  const rules = await prisma.compatibilityRule.findMany({
    where: { productId },
    orderBy: { createdAt: "asc" },
    include: { category: { select: { name: true, tangoPath: true } }, brand: { select: { name: true } } },
  });
  return Promise.all(rules.map(async (r) => ({ id: r.id, label: describeRule(r), count: await prisma.product.count({ where: await ruleWhere(r, productId) }) })));
}

export async function listCompatibilityRules(productId: string): Promise<RuleView[]> {
  await requireStaff("products.view");
  return view(productId);
}

/** Cuántos productos entran con lo elegido, antes de guardar. */
export async function previewCompatibilityRule(input: z.input<typeof ruleSchema>): Promise<{ ok: boolean; count?: number; examples?: string[]; error?: string }> {
  await requireStaff("products.view");
  const parsed = ruleSchema.safeParse({ ...input, line: input.line?.trim() || null });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const where = await ruleWhere(parsed.data, parsed.data.productId);
  const [count, examples] = await Promise.all([prisma.product.count({ where }), prisma.product.findMany({ where, take: 5, select: { normalizedName: true }, orderBy: { normalizedName: "asc" } })]);
  return { ok: true, count, examples: examples.map((e) => e.normalizedName) };
}

export async function addCompatibilityRule(input: z.input<typeof ruleSchema>): Promise<{ ok: boolean; rules?: RuleView[]; error?: string }> {
  await requireStaff("products.edit");
  const parsed = ruleSchema.safeParse({ ...input, line: input.line?.trim() || null });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.compatibilityRule.create({ data: parsed.data });
  revalidatePath(`/admin/products/${parsed.data.productId}`);
  return { ok: true, rules: await view(parsed.data.productId) };
}

export async function removeCompatibilityRule(input: { id: string }): Promise<{ ok: boolean; rules?: RuleView[]; error?: string }> {
  await requireStaff("products.edit");
  const rule = await prisma.compatibilityRule.findUnique({ where: { id: input.id } });
  if (!rule) return { ok: false, error: "Esa regla ya no existe." };
  await prisma.compatibilityRule.delete({ where: { id: input.id } });
  revalidatePath(`/admin/products/${rule.productId}`);
  return { ok: true, rules: await view(rule.productId) };
}
