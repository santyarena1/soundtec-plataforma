"use client";

import { useState } from "react";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  FileText,
  ImageIcon,
  Download,
  ChevronDown,
  ChevronUp,
  Ruler,
  Tag,
  PlayCircle,
  ExternalLink,
  TrendingDown,
  Clock,
  Sparkles,
} from "lucide-react";

import { filterCustomerBadges } from "@/lib/manufacturer-promo";

interface SpecItem {
  label?: string;
  name?: string;
  value?: string;
  labelEs?: string;
  valueEs?: string;
  attributeValues?: Array<{ value?: string; valueDisplay?: string }>;
}

interface DocItem {
  name?: string;
  description?: string;
  documentType?: string;
  fileTypeString?: string;
  filePath?: string;
  fileUrl?: string;
  nameEs?: string;
  url?: string;
  type?: string;
}

interface BadgeItem {
  name?: string;
  type?: string;
}

export interface ProductRichInfoProps {
  specifications: unknown;
  documents: unknown;
  badges: unknown;
  videoUrl: string | null;
  htmlContent: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  weight: number | null;
  modelNumber: string | null;
  manufacturerItem: string | null;
  productLine: string | null;
  isCrestronHomeCompatible: boolean;
}

function asArray<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function badgeText(b: unknown): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object" && typeof (b as BadgeItem).name === "string") {
    return (b as BadgeItem).name as string;
  }
  return "";
}

function getVideoEmbedUrl(url: string): string | null {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

function isImageUrl(url: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|avif)(\?|$)/i.test(url);
}

function fileIconForType(type: string, url: string): "image" | "doc" {
  if (type === "image" || isImageUrl(url)) return "image";
  return "doc";
}

export function ProductRichInfo(props: ProductRichInfoProps) {
  const specs = asArray<SpecItem>(props.specifications);
  const docs = asArray<DocItem>(props.documents);
  const badges = filterCustomerBadges(props.badges)
    .map((b) => badgeText(b))
    .filter((s) => s.length > 0);

  const [showHtml, setShowHtml] = useState(false);
  const [showAllSpecs, setShowAllSpecs] = useState(false);

  const normalizedSpecs = specs
    .map((s) => {
      const label = s.labelEs || s.label || s.name || "";
      const value =
        s.valueEs ||
        s.value ||
        (Array.isArray(s.attributeValues)
          ? s.attributeValues
              .map((av) => av.valueDisplay ?? av.value ?? "")
              .filter(Boolean)
              .join(" · ")
          : "");
      return { label: String(label).trim(), value: String(value).trim() };
    })
    .filter((r) => r.label.length > 0 && r.value.length > 0);

  const visibleSpecs = showAllSpecs ? normalizedSpecs : normalizedSpecs.slice(0, 8);

  const hasDimensions = props.widthCm != null || props.heightCm != null || props.depthCm != null;
  const hasIdentifiers = props.modelNumber || props.manufacturerItem || props.productLine;
  const videoEmbed = props.videoUrl ? getVideoEmbedUrl(props.videoUrl) : null;

  // Si no hay NADA, no renderizamos nada (la ficha base ya cubre lo mínimo)
  const hasContent =
    normalizedSpecs.length > 0 ||
    docs.length > 0 ||
    badges.length > 0 ||
    props.videoUrl ||
    props.htmlContent ||
    hasDimensions ||
    hasIdentifiers ||
    props.isCrestronHomeCompatible;

  if (!hasContent) return null;

  return (
    <div className="space-y-4">
      {/* Badges destacados del proveedor (NEW / EXCLUSIVE / etc) */}
      {badges.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {badges.map((b, i) => (
            <Badge key={i} tone="accent">
              <Sparkles className="h-3 w-3" />
              {b}
            </Badge>
          ))}
          {props.isCrestronHomeCompatible ? (
            <Badge tone="primary">Compatible Crestron Home</Badge>
          ) : null}
        </div>
      ) : props.isCrestronHomeCompatible ? (
        <div className="flex flex-wrap gap-1.5">
          <Badge tone="primary">Compatible Crestron Home</Badge>
        </div>
      ) : null}

      {/* Video del producto */}
      {videoEmbed ? (
        <Card>
          <CardContent className="p-0 overflow-hidden">
            <div className="aspect-video w-full bg-black">
              <iframe
                src={videoEmbed}
                title="Video del producto"
                className="h-full w-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </CardContent>
        </Card>
      ) : props.videoUrl ? (
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <PlayCircle className="h-5 w-5 text-accent" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Video del producto</p>
              <a
                href={props.videoUrl}
                target="_blank"
                rel="noreferrer noopener"
                className="text-xs text-primary hover:underline truncate inline-flex items-center gap-1"
              >
                {props.videoUrl}
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Dimensiones y peso */}
      {(hasDimensions || props.weight) ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ruler className="h-4 w-4 text-accent" />
              Dimensiones físicas
            </CardTitle>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
              {props.widthCm != null ? (
                <div className="rounded-md bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Ancho</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {Number(props.widthCm).toFixed(1)} <span className="text-xs text-muted-foreground">cm</span>
                  </p>
                </div>
              ) : null}
              {props.heightCm != null ? (
                <div className="rounded-md bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Alto</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {Number(props.heightCm).toFixed(1)} <span className="text-xs text-muted-foreground">cm</span>
                  </p>
                </div>
              ) : null}
              {props.depthCm != null ? (
                <div className="rounded-md bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Profundidad</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {Number(props.depthCm).toFixed(1)} <span className="text-xs text-muted-foreground">cm</span>
                  </p>
                </div>
              ) : null}
              {props.weight != null ? (
                <div className="rounded-md bg-secondary/50 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Peso</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">
                    {Number(props.weight).toFixed(2)} <span className="text-xs text-muted-foreground">kg</span>
                  </p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Identificadores del fabricante */}
      {hasIdentifiers ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-accent" />
              Identificación del fabricante
            </CardTitle>
            <div className="grid gap-3 sm:grid-cols-3 text-sm">
              {props.modelNumber ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Modelo</p>
                  <p className="mt-1 font-mono">{props.modelNumber}</p>
                </div>
              ) : null}
              {props.manufacturerItem ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">SKU fabricante</p>
                  <p className="mt-1 font-mono">{props.manufacturerItem}</p>
                </div>
              ) : null}
              {props.productLine ? (
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Línea</p>
                  <p className="mt-1">{props.productLine}</p>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      {/* Especificaciones técnicas */}
      {normalizedSpecs.length > 0 ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Tag className="h-4 w-4 text-accent" />
              Especificaciones técnicas
              <Badge tone="muted">{normalizedSpecs.length}</Badge>
            </CardTitle>
            <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {visibleSpecs.map((s, i) => (
                <div
                  key={i}
                  className="flex items-baseline justify-between gap-3 border-b border-border/40 pb-1.5 text-sm"
                >
                  <span className="text-muted-foreground">{s.label}</span>
                  <span className="font-medium text-right break-words max-w-[60%]">{s.value}</span>
                </div>
              ))}
            </div>
            {normalizedSpecs.length > 8 ? (
              <button
                type="button"
                onClick={() => setShowAllSpecs((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
              >
                {showAllSpecs ? (
                  <>
                    Ver menos <ChevronUp className="h-3 w-3" />
                  </>
                ) : (
                  <>
                    Ver las {normalizedSpecs.length - 8} restantes <ChevronDown className="h-3 w-3" />
                  </>
                )}
              </button>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {/* Documentos descargables */}
      {docs.length > 0 ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-accent" />
              Documentación
              <Badge tone="muted">{docs.length}</Badge>
            </CardTitle>
            <ul className="grid gap-2 sm:grid-cols-2">
              {docs.map((d, i) => {
                const name = d.nameEs || d.name || d.description || `Documento ${i + 1}`;
                const url = d.fileUrl || d.url || d.filePath || "";
                const type = d.documentType || d.type || d.fileTypeString || "";
                const iconKind = fileIconForType(type, url);
                if (!url) return null;
                return (
                  <li key={i}>
                    <a
                      href={url}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="flex items-center gap-3 rounded-md border border-border bg-secondary/30 px-3 py-2.5 text-sm transition-colors hover:bg-accent/10 hover:border-accent/40"
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-md bg-accent/10 shrink-0">
                        {iconKind === "image" ? (
                          <ImageIcon className="h-4 w-4 text-accent" />
                        ) : (
                          <FileText className="h-4 w-4 text-accent" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{name}</p>
                        {type ? (
                          <p className="text-[11px] text-muted-foreground uppercase tracking-wide">{type}</p>
                        ) : null}
                      </div>
                      <Download className="h-4 w-4 text-muted-foreground shrink-0" />
                    </a>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* HTML enriquecido del proveedor (colapsable porque suele ser largo) */}
      {props.htmlContent ? (
        <Card>
          <CardContent className="p-5 space-y-3">
            <button
              type="button"
              onClick={() => setShowHtml((v) => !v)}
              className="flex w-full items-center justify-between"
            >
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="h-4 w-4 text-accent" />
                Información extendida del proveedor
              </CardTitle>
              {showHtml ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </button>
            {showHtml ? (
              <div
                className="prose prose-sm max-w-none border-t border-border pt-3 text-sm"
                dangerouslySetInnerHTML={{ __html: props.htmlContent }}
              />
            ) : (
              <p className="text-xs text-muted-foreground">
                Contenido enriquecido del fabricante (HTML). Click para expandir.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

// Banner de oferta (sale) — componente separado para que se pueda usar en la
// columna del precio.
export function SaleBanner({
  saleUsd,
  baseUsd,
  startsAt,
  endsAt,
  label,
}: {
  saleUsd: number;
  baseUsd: number;
  startsAt: Date | null;
  endsAt: Date | null;
  label: string | null;
}) {
  const now = new Date();
  const start = startsAt ? new Date(startsAt) : null;
  const end = endsAt ? new Date(endsAt) : null;
  const active = (!start || now >= start) && (!end || now <= end);
  if (!active) return null;
  const savings = baseUsd > 0 ? Math.round(((baseUsd - saleUsd) / baseUsd) * 100) : 0;

  return (
    <div className="rounded-md border-2 border-success bg-success/5 p-3 space-y-1">
      <div className="flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-success" />
        <span className="text-xs font-semibold uppercase tracking-wider text-success">
          {label || "Oferta vigente"}
        </span>
        {savings > 0 ? <Badge tone="success">-{savings}%</Badge> : null}
      </div>
      {end ? (
        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          Vence el {end.toLocaleDateString("es-AR")}
        </p>
      ) : null}
    </div>
  );
}
