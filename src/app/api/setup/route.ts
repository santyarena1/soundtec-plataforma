import { NextResponse } from "next/server";
import { PrismaClient, UserRole, RuleScopeType } from "@prisma/client";
import bcrypt from "bcryptjs";

export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SETUP !== "true") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const token = req.headers.get("x-setup-token");
  const expected = process.env.SETUP_TOKEN;
  if (!expected || token !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const adminEmail = process.env.SEED_ADMIN_EMAIL;
  const adminPassword = process.env.SEED_ADMIN_PASSWORD;
  const adminName = process.env.SEED_ADMIN_NAME || "Administrador Soundtec";
  if (!adminEmail || !adminPassword || adminPassword.length < 12) {
    return NextResponse.json(
      { error: "SETUP requiere SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (12+ caracteres)." },
      { status: 400 }
    );
  }

  const prisma = new PrismaClient();

  try {
    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const admin = await prisma.user.upsert({
      where: { email: adminEmail.toLowerCase() },
      update: { passwordHash, role: UserRole.SUPER_ADMIN, isActive: true, name: adminName },
      create: {
        email: adminEmail.toLowerCase(),
        name: adminName,
        passwordHash,
        role: UserRole.SUPER_ADMIN,
        companyName: "Soundtec S.R.L.",
        isActive: true,
      },
    });

    const demoClient = await prisma.client.upsert({
      where: { id: "seed-client-demo" },
      update: { companyName: "Integrador Demo S.A.", isActive: true },
      create: {
        id: "seed-client-demo",
        companyName: "Integrador Demo S.A.",
        contactName: "Cliente Demo",
        email: "comercial@integrador-demo.com.ar",
        phone: "+54 11 5555-5555",
        notes: "Cliente comercial de prueba.",
        isActive: true,
      },
    });

    await prisma.user.upsert({
      where: { email: "cliente.demo@soundtec.com.ar" },
      update: { clientId: demoClient.id },
      create: {
        email: "cliente.demo@soundtec.com.ar",
        name: "Usuario Portal Demo",
        passwordHash: await bcrypt.hash(adminPassword, 12),
        role: UserRole.CLIENT,
        companyName: "Integrador Demo S.A.",
        isActive: true,
        clientId: demoClient.id,
      },
    });

    const settings = [
      { key: "app.name", value: "Soundtec", description: "Nombre comercial." },
      { key: "app.currency", value: "USD", description: "Moneda principal." },
      { key: "app.global_margin_percent", value: "35", description: "Margen global (%)." },
      { key: "branding.primary_color", value: "#1e3553", description: "Color primario." },
      { key: "branding.accent_color", value: "#2563eb", description: "Color acento." },
      { key: "visibility.default_show_all", value: "true", description: "Clientes ven todo el catálogo." },
    ];

    for (const s of settings) {
      await prisma.adminSetting.upsert({
        where: { key: s.key },
        update: {},
        create: { key: s.key, value: s.value, isSecret: false, description: s.description },
      });
    }

    await prisma.marginRule.upsert({
      where: { id: "global-default-margin" },
      update: {},
      create: {
        id: "global-default-margin",
        name: "Margen global por defecto",
        priority: 1000,
        scopeType: RuleScopeType.GLOBAL,
        marginPercent: 35,
        isActive: true,
        notes: "Se aplica cuando no hay regla más específica.",
      },
    });

    await prisma.landingHero.upsert({
      where: { id: "hero-principal" },
      update: {},
      create: {
        id: "hero-principal",
        title: "Soluciones audiovisuales integradas, ejecutadas con criterio profesional.",
        subtitle: "Audio, video, iluminación, videoconferencia, automatización y control inteligente.",
        ctaText: "Acceder al portal",
        ctaUrl: "/login",
        imageUrl: "",
        isActive: true,
      },
    });

    return NextResponse.json({
      ok: true,
      admin: admin.email,
      demoClient: demoClient.companyName,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: "No se pudo completar el setup." }, { status: 500 });
  } finally {
    await prisma.$disconnect();
  }
}
