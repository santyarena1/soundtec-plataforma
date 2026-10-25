import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";

/** Fuerza bruta: después de 8 intentos fallidos con el mismo email, el ingreso se frena con un aviso claro. */
const email = `e2e-bruteforce-${Date.now().toString(36)}@soundtec.test`;

test.afterAll(async () => {
  // Rama de prueba: se limpian los contadores para no trabar otras corridas desde la misma IP.
  const prisma = new PrismaClient();
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "login:" } } });
  await prisma.$disconnect();
});

test("8 intentos fallidos bloquean la cuenta y se avisa", async ({ page }) => {
  test.setTimeout(300_000);
  await page.goto("/login", { waitUntil: "networkidle" });
  const error = page.locator("form .text-destructive").first();
  for (let i = 0; i < 8; i++) {
    await page.locator("#email").fill(email);
    await page.locator("#password").fill(`incorrecta-${i}`);
    await page.getByRole("button", { name: "Iniciar sesión" }).click();
    await expect(error).toContainText("Credenciales inválidas", { timeout: 30_000 });
  }
  await page.locator("#password").fill("otra-mas");
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await expect(error).toContainText("Demasiados intentos", { timeout: 30_000 });
});
