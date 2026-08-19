import { PrismaClient, UserRole, RuleScopeType, StockStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function main() {
  const adminEmail = process.env.SEED_ADMIN_EMAIL || "admin@soundtec.com.ar";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD || "Soundtec!2026";
  const adminName = process.env.SEED_ADMIN_NAME || "Administrador Soundtec";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      isActive: true,
      name: adminName,
    },
    create: {
      email: adminEmail,
      name: adminName,
      passwordHash,
      role: UserRole.SUPER_ADMIN,
      companyName: "Soundtec S.R.L.",
      isActive: true,
    },
  });
  console.log(`Admin listo: ${admin.email}`);

  // Cliente demo
  const clientPassword = await bcrypt.hash("Cliente!2026", 12);
  const demoClient = await prisma.client.upsert({
    where: { id: "seed-client-demo" },
    update: {
      companyName: "Integrador Demo S.A.",
      contactName: "Cliente Demo",
      email: "comercial@integrador-demo.com.ar",
      phone: "+54 11 5555-5555",
      notes: "Cliente comercial de prueba creado por el seed.",
      isActive: true,
    },
    create: {
      id: "seed-client-demo",
      companyName: "Integrador Demo S.A.",
      contactName: "Cliente Demo",
      email: "comercial@integrador-demo.com.ar",
      phone: "+54 11 5555-5555",
      notes: "Cliente comercial de prueba creado por el seed.",
      isActive: true,
    },
  });

  const clientUser = await prisma.user.upsert({
    where: { email: "cliente.demo@soundtec.com.ar" },
    update: { clientId: demoClient.id },
    create: {
      email: "cliente.demo@soundtec.com.ar",
      name: "Usuario Portal Demo",
      passwordHash: clientPassword,
      role: UserRole.CLIENT,
      companyName: "Integrador Demo S.A.",
      phone: "+54 11 5555-5555",
      isActive: true,
      clientId: demoClient.id,
    },
  });
  console.log(`Cliente comercial: ${demoClient.companyName}`);
  console.log(`Usuario portal: ${clientUser.email} / Cliente!2026`);

  // Configuración global
  const settings: Array<{ key: string; value: string; isSecret?: boolean; description?: string }> = [
    { key: "app.name", value: process.env.APP_NAME || "Soundtec", description: "Nombre comercial del portal." },
    { key: "app.currency", value: process.env.DEFAULT_CURRENCY || "USD", description: "Moneda principal." },
    { key: "app.global_margin_percent", value: process.env.DEFAULT_GLOBAL_MARGIN_PERCENT || "35", description: "Margen global por defecto (%)." },
    { key: "branding.primary_color", value: "#1e3553", description: "Color primario navy." },
    { key: "branding.accent_color", value: "#2563eb", description: "Color de acento azul tecnológico." },
    { key: "branding.success_color", value: "#0ea5e9", description: "Color de estado positivo." },
    { key: "branding.logo_url", value: "", description: "URL del logo principal." },
    { key: "openai.api_key", value: "", isSecret: true, description: "API key de OpenAI." },
    { key: "openai.model", value: process.env.OPENAI_MODEL || "gpt-4o-mini", description: "Modelo OpenAI por defecto." },
    { key: "serper.api_key", value: "", isSecret: true, description: "API key de Serper para búsqueda de imágenes." },
    { key: "quotes.company.tagline", value: "integramos tecnología", description: "Tagline de cotizaciones." },
    { key: "quotes.company.address", value: "Av. Donato Álvarez 1526, CABA", description: "Pie de cotización." },
    { key: "quotes.company.email", value: "info@soundtec.com.ar", description: "Mail de cotizaciones." },
    { key: "quotes.company.web", value: "www.soundtec.com.ar", description: "Web de cotizaciones." },
    { key: "quotes.number.next_sequence", value: "14544", description: "Siguiente correlativo COT." },
  ];

  for (const setting of settings) {
    await prisma.adminSetting.upsert({
      where: { key: setting.key },
      update: { description: setting.description },
      create: {
        key: setting.key,
        value: setting.value,
        isSecret: setting.isSecret || false,
        description: setting.description,
      },
    });
  }
  console.log(`Configuración global: ${settings.length} claves.`);

  // Regla de margen global
  await prisma.marginRule.upsert({
    where: { id: "global-default-margin" },
    update: {},
    create: {
      id: "global-default-margin",
      name: "Margen global por defecto",
      priority: 1000,
      scopeType: RuleScopeType.GLOBAL,
      marginPercent: Number(process.env.DEFAULT_GLOBAL_MARGIN_PERCENT || "35"),
      isActive: true,
      notes: "Se aplica cuando no hay una regla más específica.",
    },
  });

  // Marca y distribuidor demo
  const brand = await prisma.brand.upsert({
    where: { slug: "shure" },
    update: {},
    create: {
      name: "Shure",
      slug: "shure",
      description: "Audio profesional para broadcast, conferencia y eventos.",
      isActive: true,
    },
  });

  const distributor = await prisma.distributor.upsert({
    where: { slug: "audiobrands-arg" },
    update: {},
    create: {
      name: "AudioBrands Argentina",
      slug: "audiobrands-arg",
      contactInfo: { email: "ventas@audiobrands.com", phone: "+54 11 4444-4444" },
      isActive: true,
    },
  });

  // Categorías
  const catAudio = await prisma.category.upsert({
    where: { slug: "audio" },
    update: {},
    create: { name: "Audio", slug: "audio" },
  });
  const catMicros = await prisma.category.upsert({
    where: { slug: "microfonia" },
    update: {},
    create: { name: "Microfonía", slug: "microfonia", parentId: catAudio.id },
  });
  await prisma.category.upsert({
    where: { slug: "video" },
    update: {},
    create: { name: "Video", slug: "video" },
  });
  await prisma.category.upsert({
    where: { slug: "videoconferencia" },
    update: {},
    create: { name: "Videoconferencia", slug: "videoconferencia" },
  });
  await prisma.category.upsert({
    where: { slug: "iluminacion" },
    update: {},
    create: { name: "Iluminación", slug: "iluminacion" },
  });
  await prisma.category.upsert({
    where: { slug: "automatizacion" },
    update: {},
    create: { name: "Automatización y Control", slug: "automatizacion" },
  });

  // Familia demo
  const family = await prisma.productFamily.upsert({
    where: { slug: "wireless" },
    update: {},
    create: { name: "Inalámbricos", slug: "wireless" },
  });

  // Lista de precios demo
  const priceList = await prisma.priceList.create({
    data: {
      name: `Lista ${brand.name} - ${new Date().toLocaleDateString("es-AR")}`,
      brandId: brand.id,
      distributorId: distributor.id,
      currency: "USD",
      sourceType: "MANUAL",
      status: "ACTIVE",
    },
  });

  // Productos demo
  const productsData = [
    {
      name: "Shure SM58-LC Micrófono Dinámico Vocal",
      sku: "SHU-SM58-LC",
      cost: 109.0,
      short: "Micrófono dinámico cardioide estándar mundial para voces en vivo y estudio.",
      long: "El SM58 es el estándar de la industria para presentaciones en vivo. Patrón polar cardioide que aísla la fuente principal y minimiza el ruido de fondo. Filtro esférico integrado que reduce los plosivos.",
      category: catMicros.id,
      stock: StockStatus.IN_STOCK,
      stockQty: 24,
    },
    {
      name: "Shure BLX24/PG58 Sistema Inalámbrico Vocal",
      sku: "SHU-BLX24-PG58",
      cost: 389.0,
      short: "Sistema inalámbrico de mano con micrófono PG58 y receptor BLX4.",
      long: "Sistema inalámbrico digital de fácil configuración, 14 horas de batería, scan automático de frecuencias y hasta 12 sistemas compatibles simultáneamente.",
      category: catMicros.id,
      family: family.id,
      stock: StockStatus.LOW_STOCK,
      stockQty: 3,
      customizable: true,
    },
    {
      name: "Shure MV7 Micrófono USB/XLR Podcasting",
      sku: "SHU-MV7-K",
      cost: 249.0,
      short: "Micrófono dinámico híbrido USB/XLR ideal para podcasting y streaming.",
      long: "Calidad de estudio con voice isolation technology, conexión USB y XLR simultánea, compatible con Shure ShurePlus MOTIV App.",
      category: catMicros.id,
      stock: StockStatus.ON_REQUEST,
      stockQty: null,
    },
  ];

  for (const p of productsData) {
    await prisma.product.upsert({
      where: { internalSku: p.sku },
      update: {},
      create: {
        internalSku: p.sku,
        supplierSku: p.sku,
        normalizedName: p.name,
        originalName: p.name,
        brandId: brand.id,
        distributorId: distributor.id,
        categoryId: p.category,
        familyId: p.family,
        shortDescription: p.short,
        longDescription: p.long,
        baseCostUsd: p.cost,
        currency: "USD",
        stockStatus: p.stock,
        stockQuantity: p.stockQty,
        isCustomizable: p.customizable || false,
        isActive: true,
        images: {
          create: [
            {
              url: `https://placehold.co/800x600/1e3553/ffffff/png?text=${encodeURIComponent(p.name.slice(0, 20))}`,
              alt: p.name,
              source: "placeholder",
              isPrimary: true,
            },
          ],
        },
      },
    });
  }

  // Landing hero
  await prisma.landingHero.upsert({
    where: { id: "hero-principal" },
    update: {},
    create: {
      id: "hero-principal",
      title: "Soluciones audiovisuales integradas, ejecutadas con criterio profesional.",
      subtitle:
        "Audio, video, iluminación, videoconferencia, automatización y control inteligente para proyectos corporativos, educativos, culturales y de eventos.",
      ctaText: "Acceder al portal",
      ctaUrl: "/login",
      imageUrl: "",
      isActive: true,
    },
  });

  // Post de novedades demo
  await prisma.landingPost.upsert({
    where: { slug: "lanzamos-portal-clientes" },
    update: {},
    create: {
      title: "Lanzamos nuestro portal para clientes",
      slug: "lanzamos-portal-clientes",
      excerpt:
        "Listas de precios en USD, configuración de productos, solicitudes de presupuesto y seguimiento de proyectos, todo en un solo lugar.",
      content:
        "## Un portal hecho para integradores\n\nA partir de hoy, nuestros clientes pueden ingresar con su usuario al portal de Soundtec para acceder a las listas de precios en USD, armar configuraciones, marcar favoritos y enviar consultas y solicitudes de presupuesto directamente a nuestro equipo comercial.\n\nSi todavía no recibiste tu acceso, contactanos.",
      coverImageUrl: "",
      isPublished: true,
      publishedAt: new Date(),
    },
  });

  // Rol empleado catálogo (sin precios, solo productos)
  const catalogRole = await prisma.customRole.upsert({
    where: { id: "seed-role-catalog-employee" },
    update: {
      name: "Empleado catálogo",
      description: "Solo ve y edita productos. Sin acceso a precios, márgenes ni configuración.",
      baseSystemRole: UserRole.ADMIN,
      permissionsJson: {
        scopes: ["products.view", "products.edit", "brands.manage", "categories.manage", "families.manage"],
        hidePrices: true,
      },
      isActive: true,
    },
    create: {
      id: "seed-role-catalog-employee",
      name: "Empleado catálogo",
      description: "Solo ve y edita productos. Sin acceso a precios, márgenes ni configuración.",
      baseSystemRole: UserRole.ADMIN,
      permissionsJson: {
        scopes: ["products.view", "products.edit", "brands.manage", "categories.manage", "families.manage"],
        hidePrices: true,
      },
      isActive: true,
    },
  });

  const catalogPassword = await bcrypt.hash("Catalogo!2026", 12);
  const catalogUser = await prisma.user.upsert({
    where: { email: "catalogo@soundtec.com.ar" },
    update: {
      customRoleId: catalogRole.id,
      role: UserRole.ADMIN,
      isActive: true,
    },
    create: {
      email: "catalogo@soundtec.com.ar",
      name: "Empleado Catálogo",
      passwordHash: catalogPassword,
      role: UserRole.ADMIN,
      customRoleId: catalogRole.id,
      companyName: "Soundtec S.R.L.",
      isActive: true,
    },
  });
  console.log(`Empleado catálogo: ${catalogUser.email} / Catalogo!2026`);

  // Migración legacy: usuarios CLIENT sin Client → crear Client y reasignar reglas
  const legacyUsers = await prisma.user.findMany({
    where: { role: UserRole.CLIENT, clientId: null },
  });
  for (const u of legacyUsers) {
    const commercial = await prisma.client.create({
      data: {
        companyName: u.companyName || u.name,
        contactName: u.name,
        email: u.email,
        phone: u.phone,
        isActive: u.isActive,
      },
    });
    await prisma.user.update({ where: { id: u.id }, data: { clientId: commercial.id } });
    await prisma.visibilityRule.updateMany({ where: { clientId: u.id }, data: { clientId: commercial.id } });
    await prisma.marginRule.updateMany({ where: { clientId: u.id }, data: { clientId: commercial.id } });
    await prisma.discountRule.updateMany({ where: { clientId: u.id }, data: { clientId: commercial.id } });
    await prisma.accountMovement.updateMany({ where: { clientId: u.id }, data: { clientId: commercial.id } });
    await prisma.customerRequest.updateMany({ where: { userId: u.id, clientId: null }, data: { clientId: commercial.id } });
    console.log(`Migrado usuario legacy → cliente: ${commercial.companyName}`);
  }

  await prisma.adminChangelog.upsert({
    where: { id: "changelog-bootstrap-v1" },
    update: {},
    create: {
      id: "changelog-bootstrap-v1",
      version: "1.0",
      releasedAt: new Date(),
      summary:
        "El admin ahora avisa las novedades con un changelog. Además, en márgenes y descuentos una regla puede cubrir varias marcas o clientes y se edita una subregla o el grupo entero.",
      isPublished: true,
      createdById: admin.id,
      items: [
        {
          kind: "NUEVO",
          text: "Changelog interno: historial de versiones, botón arriba del dólar, y un popup la primera vez que hay algo nuevo.",
        },
        {
          kind: "NUEVO",
          text: "Reglas de precio agrupadas: tildás varias marcas o clientes y queda 1 regla con subreglas. Editar esta / Editar todo.",
        },
        {
          kind: "MEJORA",
          text: "Markup se carga tal cual: 2,75 = costo × 2,75. No se suma 1.",
        },
      ],
    },
  });
  console.log("Changelog inicial listo.");

  console.log("Seed completo.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
