import { prisma } from "@/lib/prisma";

let ensured: Promise<void> | null = null;

/**
 * Neon pooler a veces hace que `prisma db push` reporte sync sin crear tablas.
 * Este ensure es idempotente y se corre antes de operar el Room Builder.
 */
export async function ensureRoomBuilderSchema(): Promise<void> {
  if (!ensured) {
    ensured = runEnsure().catch((error) => {
      ensured = null;
      throw error;
    });
  }
  await ensured;
}

async function tableExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS "exists"
  `;
  return Boolean(rows[0]?.exists);
}

async function exec(sql: string) {
  await prisma.$executeRawUnsafe(sql);
}

async function runEnsure(): Promise<void> {
  const hasProfile = await tableExists("ProductDesignProfile");
  const hasProject = await tableExists("RoomProject");
  const hasDevice = await tableExists("RoomProjectDevice");
  if (hasProfile && hasProject && hasDevice) return;

  if (!hasProfile) {
    await exec(`
      CREATE TABLE IF NOT EXISTS "ProductDesignProfile" (
        "id" TEXT NOT NULL,
        "productId" TEXT NOT NULL,
        "designRole" TEXT,
        "roomCategories" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "mountOptions" TEXT[] DEFAULT ARRAY[]::TEXT[],
        "defaultMountHeightM" DECIMAL(6,3),
        "widthM" DECIMAL(8,4),
        "heightM" DECIMAL(8,4),
        "depthM" DECIMAL(8,4),
        "weightKg" DECIMAL(10,3),
        "hfovDeg" DECIMAL(6,2),
        "vfovDeg" DECIMAL(6,2),
        "maxRangeM" DECIMAL(6,2),
        "micPattern" TEXT,
        "coverageRadiusM" DECIMAL(6,2),
        "coverageWidthM" DECIMAL(6,2),
        "diagonalIn" DECIMAL(6,2),
        "viewingDistanceMinM" DECIMAL(6,2),
        "viewingDistanceMaxM" DECIMAL(6,2),
        "coverageAngleDeg" DECIMAL(6,2),
        "sensitivityDb" DECIMAL(6,2),
        "proxyKey" TEXT,
        "model3dUrl" TEXT,
        "model3dSource" TEXT,
        "completenessScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "confidenceScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "status" TEXT NOT NULL DEFAULT 'pending',
        "fieldEvidence" JSONB,
        "lastEnrichedAt" TIMESTAMP(3),
        "approvedAt" TIMESTAMP(3),
        "approvedById" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProductDesignProfile_pkey" PRIMARY KEY ("id")
      )
    `);
    await exec(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ProductDesignProfile_productId_key" ON "ProductDesignProfile"("productId")`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS "ProductDesignProfile_designRole_idx" ON "ProductDesignProfile"("designRole")`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS "ProductDesignProfile_status_idx" ON "ProductDesignProfile"("status")`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS "ProductDesignProfile_completenessScore_idx" ON "ProductDesignProfile"("completenessScore")`,
    );
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "ProductDesignProfile"
          ADD CONSTRAINT "ProductDesignProfile_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES "Product"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "ProductDesignProfile"
          ADD CONSTRAINT "ProductDesignProfile_approvedById_fkey"
          FOREIGN KEY ("approvedById") REFERENCES "User"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  if (!hasProject) {
    await exec(`
      CREATE TABLE IF NOT EXISTS "RoomProject" (
        "id" TEXT NOT NULL,
        "name" TEXT NOT NULL,
        "kind" TEXT NOT NULL DEFAULT 'space',
        "templateKey" TEXT NOT NULL,
        "category" TEXT NOT NULL,
        "sizePreset" TEXT,
        "areaM2" DECIMAL(10,2) NOT NULL,
        "heightM" DECIMAL(6,2) NOT NULL DEFAULT 2.70,
        "platform" TEXT,
        "unitCount" INTEGER NOT NULL DEFAULT 1,
        "status" TEXT NOT NULL DEFAULT 'draft',
        "visibility" TEXT NOT NULL DEFAULT 'private',
        "sceneJson" JSONB NOT NULL,
        "notes" TEXT,
        "parentId" TEXT,
        "ownerId" TEXT NOT NULL,
        "clientId" TEXT,
        "quoteId" TEXT,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RoomProject_pkey" PRIMARY KEY ("id")
      )
    `);
    for (const idx of [
      "ownerId",
      "clientId",
      "category",
      "status",
      "visibility",
      "templateKey",
      "parentId",
      "kind",
    ]) {
      await exec(
        `CREATE INDEX IF NOT EXISTS "RoomProject_${idx}_idx" ON "RoomProject"("${idx}")`,
      );
    }
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProject"
          ADD CONSTRAINT "RoomProject_parentId_fkey"
          FOREIGN KEY ("parentId") REFERENCES "RoomProject"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProject"
          ADD CONSTRAINT "RoomProject_ownerId_fkey"
          FOREIGN KEY ("ownerId") REFERENCES "User"("id")
          ON DELETE RESTRICT ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProject"
          ADD CONSTRAINT "RoomProject_clientId_fkey"
          FOREIGN KEY ("clientId") REFERENCES "Client"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProject"
          ADD CONSTRAINT "RoomProject_quoteId_fkey"
          FOREIGN KEY ("quoteId") REFERENCES "Quote"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  if (!hasDevice) {
    await exec(`
      CREATE TABLE IF NOT EXISTS "RoomProjectDevice" (
        "id" TEXT NOT NULL,
        "roomProjectId" TEXT NOT NULL,
        "productId" TEXT,
        "slotKey" TEXT,
        "designRole" TEXT,
        "quantity" INTEGER NOT NULL DEFAULT 1,
        "poseJson" JSONB,
        "coverageJson" JSONB,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "RoomProjectDevice_pkey" PRIMARY KEY ("id")
      )
    `);
    await exec(
      `CREATE INDEX IF NOT EXISTS "RoomProjectDevice_roomProjectId_idx" ON "RoomProjectDevice"("roomProjectId")`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS "RoomProjectDevice_productId_idx" ON "RoomProjectDevice"("productId")`,
    );
    await exec(
      `CREATE INDEX IF NOT EXISTS "RoomProjectDevice_slotKey_idx" ON "RoomProjectDevice"("slotKey")`,
    );
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProjectDevice"
          ADD CONSTRAINT "RoomProjectDevice_roomProjectId_fkey"
          FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
    await exec(`
      DO $$ BEGIN
        ALTER TABLE "RoomProjectDevice"
          ADD CONSTRAINT "RoomProjectDevice_productId_fkey"
          FOREIGN KEY ("productId") REFERENCES "Product"("id")
          ON DELETE SET NULL ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  // Plano subido (tabla aparte para no cargar la imagen con cada proyecto).
  await exec(`
    CREATE TABLE IF NOT EXISTS "RoomPlanImage" (
      "roomProjectId" TEXT NOT NULL,
      "data" BYTEA NOT NULL,
      "mimeType" TEXT NOT NULL,
      "widthPx" INTEGER NOT NULL,
      "heightPx" INTEGER NOT NULL,
      "updatedAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "RoomPlanImage_pkey" PRIMARY KEY ("roomProjectId")
    )
  `);
  await exec(`
    DO $$ BEGIN
      ALTER TABLE "RoomPlanImage"
        ADD CONSTRAINT "RoomPlanImage_roomProjectId_fkey"
        FOREIGN KEY ("roomProjectId") REFERENCES "RoomProject"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$
  `);
}
