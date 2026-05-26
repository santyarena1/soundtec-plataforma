import { prisma } from "@/lib/prisma";

export async function getSetting(key: string, fallback = ""): Promise<string> {
  const row = await prisma.adminSetting.findUnique({ where: { key } });
  return row?.value ?? fallback;
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.adminSetting.findMany();
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

export async function setSetting(key: string, value: string, options?: { isSecret?: boolean; description?: string }) {
  await prisma.adminSetting.upsert({
    where: { key },
    update: { value, description: options?.description, isSecret: options?.isSecret ?? undefined },
    create: { key, value, isSecret: options?.isSecret ?? false, description: options?.description },
  });
}

export async function getGlobalMarginPercent(): Promise<number> {
  const v = await getSetting("app.global_margin_percent", process.env.DEFAULT_GLOBAL_MARGIN_PERCENT || "35");
  const n = Number(v);
  return Number.isFinite(n) ? n : 35;
}
