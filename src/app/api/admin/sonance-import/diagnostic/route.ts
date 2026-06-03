import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Endpoint diagnóstico para investigar discrepancias entre lo que se sincronizó
 * y lo que aparece en el catálogo público. Tres áreas:
 *  - Marcas: cuáles existen en DB, cuáles tienen productos activos, etc.
 *  - Accesorios: cuántos productos tienen relaciones de accesorio.
 *  - Configurables: cuántos productos están marcados como customizable.
 */
export async function GET() {
  try {
    await requireAdmin();

    const allBrands = await prisma.brand.findMany({
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        isActive: true,
        _count: { select: { products: true } },
      },
    });

    // Productos por marca, separando activos vs total
    const brandStats = await Promise.all(
      allBrands.map(async (b) => {
        const active = await prisma.product.count({
          where: { brandId: b.id, isActive: true },
        });
        const withImages = await prisma.product.count({
          where: { brandId: b.id, isActive: true, images: { some: {} } },
        });
        return {
          id: b.id,
          name: b.name,
          slug: b.slug,
          isActive: b.isActive,
          totalProducts: b._count.products,
          activeProducts: active,
          activeWithImages: withImages,
          willShowInSidebar: b.isActive && active > 0,
        };
      })
    );

    const productsWithoutBrand = await prisma.product.count({
      where: { isActive: true, brandId: null },
    });

    // Accesorios
    const totalRels = await prisma.accessoryRelation.count();
    const productsWithAccessories = await prisma.product.count({
      where: { accessories: { some: {} } },
    });
    const productsAsAccessory = await prisma.product.count({
      where: { accessoryFor: { some: {} } },
    });

    // Configurables
    const totalCustomizable = await prisma.product.count({
      where: { isCustomizable: true, isActive: true },
    });
    const customizableWithoutOptions = await prisma.product.count({
      where: {
        isCustomizable: true,
        isActive: true,
        options: { none: {} },
        accessories: { none: {} },
      },
    });

    // Productos totales
    const totalProducts = await prisma.product.count();
    const activeProducts = await prisma.product.count({ where: { isActive: true } });
    const productsWithImages = await prisma.product.count({
      where: { isActive: true, images: { some: {} } },
    });

    return NextResponse.json({
      ok: true,
      summary: {
        totalProducts,
        activeProducts,
        productsWithImages,
        productsWithoutBrand,
      },
      brands: brandStats,
      accessories: {
        totalRelations: totalRels,
        productsWithAccessories,
        productsAsAccessory,
      },
      configurable: {
        totalCustomizable,
        customizableWithoutOptions, // sospechosos: marcados como customizable pero sin opciones ni accesorios
      },
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : "Error desconocido";
    return NextResponse.json({ ok: false, error }, { status: 500 });
  }
}
