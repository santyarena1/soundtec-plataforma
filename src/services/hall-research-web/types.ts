/** Tipos mínimos del JSON de hallresearch.com/api/products (Prismic CMS). */

export interface RichTextSpan {
  start: number;
  end: number;
  type: string;
  data?: { url?: string; link_type?: string; target?: string } | null;
}

export interface RichTextBlock {
  type: string;
  text?: string;
  spans?: RichTextSpan[];
}

export type RichText = RichTextBlock[] | null | undefined;

export interface HallResearchSlideshowImage {
  image?: {
    url?: string | null;
    alt?: string | null;
    dimensions?: { width: number; height: number } | null;
  } | null;
}

export interface HallResearchProductData {
  brand?: string | null;
  sub_brand?: string | null;
  category?: string | null;
  product_family?: string | null;
  sorting_priority?: unknown;
  header?: RichText;
  sub_header?: RichText;
  header_description2?: RichText;
  slideshow_images?: HallResearchSlideshowImage[] | null;
  overview_paragraph_full?: RichText;
  features_body?: RichText;
  details_body?: RichText;
}

export interface HallResearchProduct {
  id: string;
  uid: string;
  tags?: string[] | null;
  data: HallResearchProductData;
}

export interface HallResearchCatalogResponse {
  results: HallResearchProduct[];
  total_results_size?: number;
}
