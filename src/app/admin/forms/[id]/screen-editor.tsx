"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowDown, ArrowUp, CopyPlus, ExternalLink, Plus, Trash2 } from "lucide-react";
import { BLOCK_LABELS, isQuestionType, type BlockType } from "@/lib/forms/types";
import type { FormBrandOption } from "@/lib/forms/public";
import { BlockEditor, type BlockPatch } from "./block-editor";
import { ICONS, acceptsFields, type Screen } from "./screens";
import { TypeMenu } from "./type-menu";

/**
 * Una pantalla del formulario con sus campos, uno debajo del otro (como en
 * Typeform). El campo abierto se edita en el lugar; los demás quedan resumidos.
 */
export function ScreenEditor({
  formId,
  token,
  screen,
  number,
  selectedBlockId,
  brands,
  pending,
  onSelectBlock,
  onPatch,
  onAddField,
  onMoveField,
  onDuplicate,
  onDeleteField,
  onDeleteScreen,
}: {
  formId: string;
  token: string;
  screen: Screen;
  number: number;
  selectedBlockId: string;
  brands: FormBrandOption[];
  pending: boolean;
  onSelectBlock: (blockId: string) => void;
  onPatch: (blockId: string, patch: BlockPatch) => void;
  onAddField: (type: BlockType) => void;
  onMoveField: (blockId: string, delta: -1 | 1) => void;
  onDuplicate: (blockId: string) => void;
  onDeleteField: (blockId: string) => void;
  onDeleteScreen: () => void;
}) {
  const [menu, setMenu] = useState(false);
  const shared = screen.blocks.length > 1;
  const canAdd = acceptsFields(screen);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-lg font-semibold">Pantalla {number}</h2>
        <span className="text-sm text-muted-foreground">
          {screen.blocks.length} campo{screen.blocks.length === 1 ? "" : "s"}
        </span>
        <Link href={`/f/${token}?previa=1`} target="_blank" className="ml-auto inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary">
          Ver cómo queda <ExternalLink className="h-3.5 w-3.5" />
        </Link>
        <button type="button" disabled={pending} onClick={onDeleteScreen} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10">
          <Trash2 className="h-4 w-4" /> Quitar pantalla
        </button>
      </div>

      <ol className="space-y-3">
        {screen.blocks.map((block, i) => {
          const open = !shared || block.id === selectedBlockId;
          const Icon = ICONS[block.type];
          const question = isQuestionType(block.type);
          return (
            <li key={block.id} className={`rounded-xl border bg-card transition ${open && shared ? "border-primary shadow-md" : "border-border"}`}>
              {shared ? (
                <div className="flex items-center gap-2 px-3 py-2.5">
                  <button type="button" onClick={() => onSelectBlock(block.id)} className="flex min-w-0 flex-1 items-center gap-2.5 text-left" aria-expanded={open}>
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${question ? "bg-primary/10 text-primary" : "bg-amber-100 text-amber-800"}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold">
                        {block.title || BLOCK_LABELS[block.type].label}
                        {block.required && question ? <span className="text-primary"> *</span> : null}
                      </span>
                      <span className="block text-[11px] text-muted-foreground">{i === 0 && !question ? "Título de la pantalla" : BLOCK_LABELS[block.type].label}</span>
                    </span>
                  </button>
                  <FieldButton label="Subir campo" disabled={i === 0 || pending} onClick={() => onMoveField(block.id, -1)}>
                    <ArrowUp className="h-4 w-4" />
                  </FieldButton>
                  <FieldButton label="Bajar campo" disabled={i === screen.blocks.length - 1 || pending} onClick={() => onMoveField(block.id, 1)}>
                    <ArrowDown className="h-4 w-4" />
                  </FieldButton>
                  <FieldButton label="Duplicar campo" disabled={pending} onClick={() => onDuplicate(block.id)}>
                    <CopyPlus className="h-4 w-4" />
                  </FieldButton>
                  <FieldButton label="Quitar campo" danger disabled={pending} onClick={() => onDeleteField(block.id)}>
                    <Trash2 className="h-4 w-4" />
                  </FieldButton>
                </div>
              ) : null}
              {open ? (
                <div className={shared ? "border-t border-border p-4" : "p-1"}>
                  <BlockEditor formId={formId} block={block} brands={brands} shared={shared} onPatch={(patch) => onPatch(block.id, patch)} />
                  {!shared ? (
                    <div className="mt-5 flex justify-end">
                      <button type="button" disabled={pending} onClick={() => onDuplicate(block.id)} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm hover:bg-secondary">
                        <CopyPlus className="h-4 w-4" /> Duplicar campo
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </li>
          );
        })}
      </ol>

      {canAdd ? (
        <div className="relative">
          <button
            type="button"
            disabled={pending}
            onClick={() => setMenu((v) => !v)}
            className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-primary/30 py-3 text-sm font-semibold text-primary transition hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" /> Agregar campo a esta pantalla
          </button>
          {menu ? (
            <TypeMenu
              mode="field"
              onClose={() => setMenu(false)}
              onPick={(type) => {
                setMenu(false);
                onAddField(type);
              }}
            />
          ) : null}
          <p className="mt-2 text-center text-xs text-muted-foreground">Los campos de una pantalla se completan juntos. Para pasar a otra pantalla, usá «Nueva pantalla» a la izquierda.</p>
        </div>
      ) : null}
    </div>
  );
}

function FieldButton({ label, onClick, disabled, danger, children }: { label: string; onClick: () => void; disabled?: boolean; danger?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`rounded-md p-1.5 text-muted-foreground disabled:opacity-30 ${danger ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-secondary hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}
