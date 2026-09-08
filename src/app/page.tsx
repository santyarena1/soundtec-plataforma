import { prisma } from "@/lib/prisma";
import { PublicNavbar } from "@/components/layout/public-navbar";
import { PublicFooter } from "@/components/layout/public-footer";
import { LandingHero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Features } from "@/components/landing/features";
import { AudiencesAndSectors } from "@/components/landing/audiences-sectors";
import { Brands } from "@/components/landing/brands";
import { AccessCta, News } from "@/components/landing/news-cta";

export const dynamic = "force-dynamic";

async function getLandingData() {
  try {
    const [hero, posts, brands, productCount, brandCount] = await Promise.all([
      prisma.landingHero.findFirst({ where: { isActive: true }, orderBy: { sortOrder: "asc" } }),
      prisma.landingPost.findMany({
        where: { isPublished: true },
        orderBy: { publishedAt: "desc" },
        take: 3,
        select: {
          id: true,
          title: true,
          excerpt: true,
          coverImageUrl: true,
          publishedAt: true,
          createdAt: true,
        },
      }),
      prisma.brand.findMany({
        where: { isActive: true, products: { some: { isActive: true } } },
        orderBy: { name: "asc" },
        take: 24,
        select: { id: true, name: true },
      }),
      prisma.product.count({ where: { isActive: true } }),
      prisma.brand.count({ where: { isActive: true, products: { some: { isActive: true } } } }),
    ]);
    return { hero, posts, brands, productCount, brandCount };
  } catch (error) {
    console.warn("Landing data fallback (¿DB no inicializada?):", error);
    return { hero: null, posts: [], brands: [], productCount: 0, brandCount: 0 };
  }
}

export default async function HomePage() {
  const { hero, posts, brands, productCount, brandCount } = await getLandingData();

  return (
    <>
      <PublicNavbar />
      <main>
        <LandingHero
          title={hero?.title}
          subtitle={hero?.subtitle}
          ctaText={hero?.ctaText}
          ctaUrl={hero?.ctaUrl}
          productCount={productCount}
          brandCount={brandCount}
        />
        <HowItWorks />
        <Features />
        <AudiencesAndSectors />
        <Brands catalogBrands={brands} />
        <News posts={posts} />
        <AccessCta />
      </main>
      <PublicFooter />
    </>
  );
}
