import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "./test";
import { totpCode } from "../src/lib/totp";

/** Verificación en dos pasos: activar, salir y volver a entrar con el código. Usuario temporal en la rama de prueba. */
const prisma = new PrismaClient();
const email = `e2e-2fa-${Date.now().toString(36)}@soundtec.test`;
const password = `Clave-e2e-${Date.now().toString(36)}!`;

test.beforeAll(async () => {
  await prisma.user.create({
    data: { email, name: "E2E dos pasos", role: "STAFF", passwordHash: await bcrypt.hash(password, 10), isActive: true },
  });
});

test.afterAll(async () => {
  await prisma.user.deleteMany({ where: { email } });
  await prisma.rateLimitBucket.deleteMany({ where: { key: { startsWith: "login:" } } });
  await prisma.$disconnect();
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/login", { waitUntil: "networkidle" });
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
}

test("activar la verificación y entrar con el código", async ({ page }) => {
  test.setTimeout(300_000);
  await login(page);
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });

  await page.goto("/cuenta/seguridad", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Activar" }).click();
  const secret = (await page.locator("code").innerText()).replace(/\s+/g, "");
  expect(secret.length).toBeGreaterThan(20);
  await page.locator("#totp-code").fill(await totpCode(secret));
  await page.getByRole("button", { name: "Confirmar y activar" }).click();
  await expect(page.getByText("quedó activa")).toBeVisible({ timeout: 30_000 });

  // Nueva sesión: la clave sola ya no alcanza.
  await page.context().clearCookies();
  await login(page);
  await expect(page.locator("#code")).toBeVisible({ timeout: 30_000 });
  await page.locator("#code").fill("000000");
  await page.getByRole("button", { name: "Verificar e ingresar" }).click();
  await expect(page.locator("form .text-destructive").first()).toContainText("no es correcto", { timeout: 30_000 });
  await page.locator("#code").fill(await totpCode(secret));
  await page.getByRole("button", { name: "Verificar e ingresar" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 60_000 });
});
