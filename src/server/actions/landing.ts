"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth-helpers";
import { slugify } from "@/lib/utils";

const heroSchema = z.object({
  title: z.string().min(2).max(240),
  subtitle: z.string().max(500).optional().nullable(),
  imageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  ctaText: z.string().max(80).optional().nullable(),
  ctaUrl: z.string().max(240).optional().nullable(),
  isActive: z.coerce.boolean().optional(),
});

export async function upsertHero(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = heroSchema.safeParse({
    title: formData.get("title"),
    subtitle: formData.get("subtitle") || null,
    imageUrl: formData.get("imageUrl") || null,
    ctaText: formData.get("ctaText") || null,
    ctaUrl: formData.get("ctaUrl") || null,
    isActive: formData.get("isActive") === "on" || formData.get("isActive") === "true",
  });
  if (!parsed.success) return;

  const data = {
    title: parsed.data.title,
    subtitle: parsed.data.subtitle ?? null,
    imageUrl: parsed.data.imageUrl ?? null,
    ctaText: parsed.data.ctaText ?? null,
    ctaUrl: parsed.data.ctaUrl ?? null,
    isActive: parsed.data.isActive ?? true,
  };
  if (id) {
    await prisma.landingHero.update({ where: { id }, data });
  } else {
    await prisma.landingHero.create({ data });
  }
  revalidatePath("/");
  revalidatePath("/admin/landing");
}

const postSchema = z.object({
  title: z.string().min(2).max(200),
  excerpt: z.string().max(500).optional().nullable(),
  content: z.string().max(50000).min(2),
  coverImageUrl: z.string().url().optional().or(z.literal("")).nullable(),
  isPublished: z.coerce.boolean().optional(),
});

export async function upsertPost(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = formData.get("id")?.toString() || undefined;
  const parsed = postSchema.safeParse({
    title: formData.get("title"),
    excerpt: formData.get("excerpt") || null,
    content: formData.get("content") || "",
    coverImageUrl: formData.get("coverImageUrl") || null,
    isPublished: formData.get("isPublished") === "on" || formData.get("isPublished") === "true",
  });
  if (!parsed.success) return;

  const slug = id ? undefined : slugify(parsed.data.title);
  const data = {
    title: parsed.data.title,
    excerpt: parsed.data.excerpt ?? null,
    content: parsed.data.content,
    coverImageUrl: parsed.data.coverImageUrl ?? null,
    isPublished: parsed.data.isPublished ?? false,
    publishedAt: parsed.data.isPublished ? new Date() : null,
  };

  if (id) {
    await prisma.landingPost.update({ where: { id }, data });
  } else {
    await prisma.landingPost.create({ data: { ...data, slug: slug || `post-${Date.now()}` } });
  }
  revalidatePath("/");
  revalidatePath("/admin/landing");
}

export async function deletePost(formData: FormData): Promise<void> {
  await requireAdmin();
  const id = String(formData.get("id") || "");
  if (!id) return;
  await prisma.landingPost.delete({ where: { id } });
  revalidatePath("/");
  revalidatePath("/admin/landing");
}
