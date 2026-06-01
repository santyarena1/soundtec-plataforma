"use client";

import * as React from "react";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, ChevronDown, ChevronUp, FileText, ImageIcon, Code } from "lucide-react";

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

export interface PortalDataPanelProps {
  modelNumber: string | null;
  manufacturerItem: string | null;
  productLine: string | null;
  vendorProductUrl: string | null;
  urlSlug: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  metaKeywords: string | null;
  videoUrl: string | null;
  salePriceUsd: number | null;
  salePriceStartsAt: Date | null;
  salePriceEndsAt: Date | null;
  salePriceLabel: string | null;
  availabilityMessage: string | null;
  availabilityType: string | null;
  widthCm: number | null;
  heightCm: number | null;
  depthCm: number | null;
  requiresQuote: boolean;
  htmlContent: string | null;
  specifications: unknown;
  documents: unknown;
  badges: unknown;
  sourceMetadata: unknown;
  enrichedAt: Date | null;
  translatedAt: Date | null;
}

function fmtDate(d: Date | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("es-AR");
}

function asArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  return [];
}

function isAnyFieldSet(props: PortalDataPanelProps): boolean {
  return !!(
    props.modelNumber ||
    props.manufacturerItem ||
    props.productLine ||
    props.vendorProductUrl ||
    props.urlSlug ||
    props.metaTitle ||
    props.metaDescription ||
    props.metaKeywords ||
    props.videoUrl ||
    props.salePriceUsd ||
    props.availabilityMessage ||
    props.widthCm ||
    props.heightCm ||
    props.depthCm ||
    props.htmlContent ||
    props.specifications ||
    props.documents ||
    props.badges ||
    props.sourceMetadata ||
    props.requiresQuote
  );
}

function HeaderSection({ enrichedAt, translatedAt }: { enrichedAt: Date | null; translatedAt: Date | null }) {
  return (
    <div className="flex items-center justify-between">
      <h3 className="text-sm font-semibold">Datos del proveedor</h3>
      <div className="flex flex-wrap gap-1.5">
        {enrichedAt ? <Badge tone="muted">Enriquecido {fmtDate(enrichedAt)}</Badge> : null}
        {translatedAt ? <Badge tone="accent">Traducido {fmtDate(translatedAt)}</Badge> : null}
      </div>
    </div>
  );
}

function IdentificationSection(props: PortalDataPanelProps) {
  const has = props.modelNumber || props.manufacturerItem || props.productLine || props.vendorProductUrl || props.urlSlug || props.videoUrl;
  if (!has) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Identificación</h4>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {props.modelNumber ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Número de modelo</p>
            <p className="font-mono">{props.modelNumber}</p>
          </div>
        ) : null}
        {props.manufacturerItem ? (
          <div>
            <p className="text-[11px] text-muted-foreground">SKU fabricante</p>
            <p className="font-mono">{props.manufacturerItem}</p>
          </div>
        ) : null}
        {props.productLine ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Línea de producto</p>
            <p>{props.productLine}</p>
          </div>
        ) : null}
        {props.urlSlug ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Slug proveedor</p>
            <p className="font-mono">{props.urlSlug}</p>
          </div>
        ) : null}
        {props.vendorProductUrl ? (
          <div className="col-span-2">
            <p className="text-[11px] text-muted-foreground">URL del proveedor</p>
            <a href={props.vendorProductUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
              {props.vendorProductUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        ) : null}
        {props.videoUrl ? (
          <div className="col-span-2">
            <p className="text-[11px] text-muted-foreground">Video</p>
            <a href={props.videoUrl} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
              {props.videoUrl}
              <ExternalLink className="h-3 w-3 shrink-0" />
            </a>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function badgeText(b: unknown): string {
  if (typeof b === "string") return b;
  if (b && typeof b === "object" && typeof (b as BadgeItem).name === "string") return (b as BadgeItem).name as string;
  return "badge";
}

function CommercialSection(props: PortalDataPanelProps & { badges: BadgeItem[] }) {
  const has = props.salePriceUsd || props.availabilityMessage || props.requiresQuote || props.badges.length > 0;
  if (!has) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Estado comercial</h4>
      <div className="flex flex-wrap gap-2 mb-3">
        {props.requiresQuote ? <Badge tone="warning">Requiere cotización</Badge> : null}
        {props.salePriceUsd != null && props.salePriceUsd > 0 ? (
          <Badge tone="success">
            En promo: USD {Number(props.salePriceUsd).toFixed(2)}
            {props.salePriceLabel ? ` — ${props.salePriceLabel}` : ""}
          </Badge>
        ) : null}
        {props.badges.map((b, i) => (
          <Badge key={i} tone="accent">{badgeText(b)}</Badge>
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {props.availabilityMessage ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Mensaje disponibilidad</p>
            <p>{props.availabilityMessage}</p>
          </div>
        ) : null}
        {props.availabilityType ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Tipo disponibilidad</p>
            <p className="font-mono">{props.availabilityType}</p>
          </div>
        ) : null}
        {props.salePriceStartsAt ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Promo desde</p>
            <p>{fmtDate(props.salePriceStartsAt)}</p>
          </div>
        ) : null}
        {props.salePriceEndsAt ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Promo hasta</p>
            <p>{fmtDate(props.salePriceEndsAt)}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function DimensionsSection(props: PortalDataPanelProps) {
  const has = props.widthCm || props.heightCm || props.depthCm;
  if (!has) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">Dimensiones físicas</h4>
      <div className="flex flex-wrap gap-4 text-sm">
        {props.widthCm != null ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Ancho</p>
            <p className="tabular-nums">{Number(props.widthCm).toFixed(2)} cm</p>
          </div>
        ) : null}
        {props.heightCm != null ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Alto</p>
            <p className="tabular-nums">{Number(props.heightCm).toFixed(2)} cm</p>
          </div>
        ) : null}
        {props.depthCm != null ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Profundidad</p>
            <p className="tabular-nums">{Number(props.depthCm).toFixed(2)} cm</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function SeoSection(props: PortalDataPanelProps) {
  const has = props.metaTitle || props.metaDescription || props.metaKeywords;
  if (!has) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">SEO</h4>
      <div className="space-y-2 text-sm">
        {props.metaTitle ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Meta title</p>
            <p>{props.metaTitle}</p>
          </div>
        ) : null}
        {props.metaDescription ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Meta description</p>
            <p>{props.metaDescription}</p>
          </div>
        ) : null}
        {props.metaKeywords ? (
          <div>
            <p className="text-[11px] text-muted-foreground">Meta keywords</p>
            <p className="font-mono text-xs">{props.metaKeywords}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function HtmlSection({ htmlContent }: { htmlContent: string | null }) {
  const [open, setOpen] = useState(false);
  if (!htmlContent) return null;
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground"
      >
        <span>Descripción HTML enriquecida</span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open ? (
        <div
          className="prose prose-sm max-w-none rounded-md border border-border p-3 bg-muted/30 text-sm"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      ) : null}
    </section>
  );
}

function SpecsSection({ specs }: { specs: SpecItem[] }) {
  if (specs.length === 0) return null;
  const rows = specs
    .map((s, i) => {
      const label = s.labelEs || s.label || s.name || "";
      const value =
        s.valueEs ||
        s.value ||
        (Array.isArray(s.attributeValues)
          ? s.attributeValues.map((av) => av.valueDisplay ?? av.value ?? "").filter(Boolean).join(" · ")
          : "");
      if (!label && !value) return null;
      return { key: i, label, value };
    })
    .filter((r): r is { key: number; label: string; value: string } => r !== null);
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Especificaciones técnicas ({specs.length})
      </h4>
      <div className="border border-border rounded-md overflow-hidden">
        <table className="w-full text-xs">
          <tbody className="divide-y divide-border">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="px-3 py-1.5 text-muted-foreground w-1/3">{r.label}</td>
                <td className="px-3 py-1.5">{r.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function DocsSection({ docs }: { docs: DocItem[] }) {
  if (docs.length === 0) return null;
  return (
    <section>
      <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
        Documentos ({docs.length})
      </h4>
      <ul className="space-y-1.5">
        {docs.map((d, i) => {
          const name = d.nameEs || d.name || d.description || `Documento ${i + 1}`;
          const url = d.fileUrl || d.url || d.filePath || "";
          const type = d.documentType || d.type || d.fileTypeString || "";
          const isImg = type === "image" || /\.(jpg|jpeg|png|gif|webp)$/i.test(url);
          return (
            <li key={i} className="flex items-center gap-2 text-sm">
              {isImg ? (
                <ImageIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              ) : (
                <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              )}
              {url ? (
                <a href={url} target="_blank" rel="noreferrer noopener" className="text-primary hover:underline inline-flex items-center gap-1 break-all">
                  {name}
                  <ExternalLink className="h-3 w-3 shrink-0" />
                </a>
              ) : (
                <span>{name}</span>
              )}
              {type ? <Badge tone="muted">{type}</Badge> : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function RawSection({ sourceMetadata }: { sourceMetadata: unknown }) {
  const [open, setOpen] = useState(false);
  if (!sourceMetadata) return null;
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Code className="h-3 w-3" /> Datos crudos del portal (JSON raw)
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>
      {open ? (
        <pre className="text-[10px] bg-muted/40 border border-border rounded-md p-3 overflow-x-auto max-h-[400px] overflow-y-auto">
          {JSON.stringify(sourceMetadata, null, 2)}
        </pre>
      ) : null}
    </section>
  );
}

export function PortalDataPanel(props: PortalDataPanelProps) {
  if (!isAnyFieldSet(props)) return null;
  const specs = asArray<SpecItem>(props.specifications);
  const docs = asArray<DocItem>(props.documents);
  const badges = asArray<BadgeItem>(props.badges);
  return (
    <Card>
      <CardContent className="p-5 space-y-5">
        <HeaderSection enrichedAt={props.enrichedAt} translatedAt={props.translatedAt} />
        <IdentificationSection {...props} />
        <CommercialSection {...props} badges={badges} />
        <DimensionsSection {...props} />
        <SeoSection {...props} />
        <HtmlSection htmlContent={props.htmlContent} />
        <SpecsSection specs={specs} />
        <DocsSection docs={docs} />
        <RawSection sourceMetadata={props.sourceMetadata} />
      </CardContent>
    </Card>
  );
}
