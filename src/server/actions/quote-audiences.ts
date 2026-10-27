"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireStaff } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/utils";

type Result = { ok: boolean; error?: string };
const input = z.object({
  label: z.string().trim().min(2, "Poné un nombre.").max(80),
  focus: z.string().trim().max(600).nullable(),
});

function done(): Result {
  revalidatePath("/admin/settings/quotes");
  revalidatePath("/admin/quotes");
  return { ok: true };
}

export async function createQuoteAudience(raw: z.input<typeof input>): Promise<Result> {
  await requireStaff("quotes.manage_library");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  const base = slugify(parsed.data.label).replace(/-/g, "_").slice(0, 40) || "rubro";
  let key = base;
  for (let i = 2; await prisma.quoteAudience.findUnique({ where: { key } }); i++) key = `${base}_${i}`;
  const last = await prisma.quoteAudience.aggregate({ _max: { sortOrder: true } });
  await prisma.quoteAudience.create({ data: { key, label: parsed.data.label, focus: parsed.data.focus || null, sortOrder: (last._max.sortOrder ?? 0) + 1 } });
  return done();
}

export async function updateQuoteAudience(key: string, raw: z.input<typeof input>): Promise<Result> {
  await requireStaff("quotes.manage_library");
  const parsed = input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };
  await prisma.quoteAudience.update({ where: { key }, data: { label: parsed.data.label, focus: parsed.data.focus || null } });
  return done();
}

/** Se archiva (no se borra): las cotizaciones y textos que la usaban siguen igual. */
export async function archiveQuoteAudience(key: string): Promise<Result> {
  await requireStaff("quotes.manage_library");
  await prisma.quoteAudience.update({ where: { key }, data: { isActive: false } });
  return done();
}
