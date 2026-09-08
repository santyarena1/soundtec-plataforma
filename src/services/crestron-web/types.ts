/**
 * Tipos del enriquecimiento desde crestron.com (sitio público del fabricante).
 *
 * Todo lo que se parsea de la ficha pública queda representado acá y se guarda
 * completo en `Product.sourceMetadata.crestronCom` además de mapearse a las
 * columnas del producto. Precio y stock NO vienen de acá (vienen de Xtrabone).
 */

export interface CrestronSpecRow {
  group: string;
  label: string;
  value: string;
}

export interface CrestronImage {
  /** id del asset en Widen CDN (ej. "asm0y3q0sy") */
  assetId: string;
  /** nombre del archivo sin extensión (ej. "master_photo_a-CP4_FrontLeft15") */
  name: string;
  title: string;
  /** URL 2500px (PNG/JPEG según el asset) */
  url: string;
  /** URL 600x400 */
  mediumUrl: string;
  /** URL 140x140 */
  thumbUrl: string;
  /** URL de descarga original */
  downloadUrl?: string;
  ext?: string;
  sizeLabel?: string;
  isPrimary: boolean;
}

export interface CrestronBadge {
  name: string;
  imageUrl?: string;
}

export interface CrestronDocument {
  /** Sección de la pestaña Resources (ej. "Spec Sheets", "Guides & Manuals") */
  section: string;
  /** Título del documento */
  name: string;
  /** Tipo de recurso que informa Crestron (ej. "Cad Drawings", "Manuals/Guides") */
  kind?: string;
  description?: string;
  /** Enlace principal (PDF / Download) */
  url: string;
  /** Etiqueta del enlace principal (PDF, Download, ZIP...) */
  format?: string;
  /** Versión HTML (docs.crestron.com) cuando existe */
  htmlUrl?: string;
}

export interface CrestronRelatedItem {
  model: string;
  materialNumber?: string;
  description?: string;
  url?: string;
  imageUrl?: string;
  quantity?: number;
}

export interface CrestronSearchHit {
  title: string;
  url: string;
  thumbnail?: string;
  description?: string;
  discontinued: boolean;
  datePublished?: string;
}

export interface CrestronProductPage {
  url: string;
  model: string;
  subtitle: string;
  materialNumber?: string;
  shortDescription?: string;
  overviewHtml: string;
  overviewText: string;
  keyFeatures: string[];
  footnotes: string[];
  legalText?: string;
  specs: CrestronSpecRow[];
  regulatoryModel?: string;
  images: CrestronImage[];
  badges: CrestronBadge[];
  categoryPath: string[];
  isDiscontinued: boolean;
  documentId?: string;
  nodeGuid?: string;
  metaTitle?: string;
  metaDescription?: string;
  metaKeywords?: string;
  videoIds: string[];
  supportLinks: Array<{ label: string; url: string }>;
  /** Parámetros crudos que usa el sitio para cargar los bloques dinámicos */
  handlers: {
    variantList?: Record<string, string>;
    variantDropdown?: Record<string, string>;
    relatedProducts?: Record<string, string>;
    interestedIn?: Record<string, string>;
    optionalAccessoryIds?: string;
    replacementIds?: string;
    replacementLabel?: string;
  };
}

export interface CrestronEnrichment {
  fetchedAt: string;
  page: CrestronProductPage;
  search?: CrestronSearchHit;
  documents: CrestronDocument[];
  variants: CrestronRelatedItem[];
  inTheBox: CrestronRelatedItem[];
  accessories: CrestronRelatedItem[];
  related: CrestronRelatedItem[];
  interestedIn: CrestronRelatedItem[];
  replacements: CrestronRelatedItem[];
  /** Modelos mencionados en el texto de la ficha (overview, features, notas, specs). */
  compatibleModels: string[];
  warnings: string[];
}

export interface CrestronEnrichmentFailure {
  fetchedAt: string;
  error: string;
  materialNumber: string;
  model?: string;
}
