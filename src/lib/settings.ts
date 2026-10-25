import { prisma } from "@/lib/prisma";
import { decryptSecret, encryptSecret, encryptionAvailable, isEncrypted } from "@/lib/secret-box";

/**
 * Las claves (isSecret) se guardan cifradas con ENCRYPTION_KEY. Las que
 * todavía estén en texto plano se cifran solas la primera vez que se leen.
 */
async function readValue(row: { key: string; value: string; isSecret: boolean }): Promise<string> {
  if (isEncrypted(row.value)) return decryptSecret(row.value);
  if (row.isSecret && row.value && encryptionAvailable()) {
    await prisma.adminSetting
      .update({ where: { key: row.key }, data: { value: encryptSecret(row.value) } })
      .catch((error) => console.error("[settings] no se pudo cifrar", row.key, error));
  }
  return row.value;
}

export async function getSetting(key: string, fallback = ""): Promise<string> {
  try {
    const row = await prisma.adminSetting.findUnique({ where: { key } });
    if (!row) return fallback;
    return await readValue(row);
  } catch {
    // Sin DB (build, smoke tests, arranque) devolvemos el default.
    return fallback;
  }
}

export async function getSettings(): Promise<Record<string, string>> {
  const rows = await prisma.adminSetting.findMany();
  const values = await Promise.all(rows.map(readValue));
  return Object.fromEntries(rows.map((r, i) => [r.key, values[i]!]));
}

/** Para pantallas: los valores de varias claves, con las secretas ya descifradas. */
export async function getSettingRows(keys: string[]): Promise<Array<{ key: string; value: string; isSecret: boolean }>> {
  const rows = await prisma.adminSetting.findMany({ where: { key: { in: keys } } });
  return Promise.all(rows.map(async (r) => ({ key: r.key, isSecret: r.isSecret, value: await readValue(r) })));
}

export async function setSetting(key: string, value: string, options?: { isSecret?: boolean; description?: string }) {
  const existing = options?.isSecret === undefined ? await prisma.adminSetting.findUnique({ where: { key }, select: { isSecret: true } }) : null;
  const secret = options?.isSecret ?? existing?.isSecret ?? false;
  const stored = secret ? encryptSecret(value) : value;
  await prisma.adminSetting.upsert({
    where: { key },
    update: { value: stored, description: options?.description, isSecret: options?.isSecret ?? undefined },
    create: { key, value: stored, isSecret: secret, description: options?.description },
  });
}

export async function getGlobalMarginPercent(): Promise<number> {
  const v = await getSetting("app.global_margin_percent", process.env.DEFAULT_GLOBAL_MARGIN_PERCENT || "35");
  const n = Number(v);
  return Number.isFinite(n) ? n : 35;
}
