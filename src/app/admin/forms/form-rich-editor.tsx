"use client";

import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Italic, Link2, List, ListOrdered, Underline, Unlink } from "lucide-react";

/**
 * Editor de texto de los formularios: párrafos, negrita, cursiva, subrayado,
 * listas, subtítulo y enlaces. Guarda HTML (se sanea en el servidor).
 */
export function FormRichEditor({
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        link: { openOnClick: false, autolink: true, defaultProtocol: "https", HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" } },
      }),
    ],
    content: value || "",
    editorProps: {
      attributes: {
        class: "form-rich min-h-[90px] px-3 py-2 text-sm outline-none",
        "aria-label": ariaLabel ?? "Texto",
        "data-placeholder": placeholder ?? "",
      },
    },
    onUpdate: ({ editor: e }) => onChange(e.isEmpty ? "" : e.getHTML()),
  });

  // Si cambia el bloque elegido, el editor muestra su texto.
  useEffect(() => {
    if (!editor) return;
    if ((value || "") !== (editor.isEmpty ? "" : editor.getHTML())) editor.commands.setContent(value || "", { emitUpdate: false });
  }, [editor, value]);

  if (!editor) return <div className="min-h-[120px] rounded-md border border-border bg-white" />;

  const btn = (active: boolean) =>
    `inline-flex h-8 w-8 items-center justify-center rounded-md transition ${active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary hover:text-foreground"}`;

  function applyLink() {
    const url = linkUrl.trim();
    if (!url) editor!.chain().focus().unsetLink().run();
    else editor!.chain().focus().extendMarkRange("link").setLink({ href: /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}` }).run();
    setLinkOpen(false);
    setLinkUrl("");
  }

  return (
    <div className="overflow-hidden rounded-md border border-border bg-white focus-within:border-primary/60">
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-secondary/40 px-1.5 py-1">
        <button type="button" className={btn(editor.isActive("bold"))} onClick={() => editor.chain().focus().toggleBold().run()} title="Negrita" aria-label="Negrita">
          <Bold className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive("italic"))} onClick={() => editor.chain().focus().toggleItalic().run()} title="Cursiva" aria-label="Cursiva">
          <Italic className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive("underline"))} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Subrayado" aria-label="Subrayado">
          <Underline className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive("heading", { level: 3 }))} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="Subtítulo" aria-label="Subtítulo">
          <Heading2 className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive("bulletList"))} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Lista" aria-label="Lista">
          <List className="h-4 w-4" />
        </button>
        <button type="button" className={btn(editor.isActive("orderedList"))} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Lista numerada" aria-label="Lista numerada">
          <ListOrdered className="h-4 w-4" />
        </button>
        <span className="mx-1 h-5 w-px bg-border" />
        <button
          type="button"
          className={btn(editor.isActive("link"))}
          onClick={() => {
            setLinkUrl(editor.getAttributes("link").href ?? "");
            setLinkOpen((v) => !v);
          }}
          title="Enlace"
          aria-label="Enlace"
        >
          <Link2 className="h-4 w-4" />
        </button>
        {editor.isActive("link") ? (
          <button type="button" className={btn(false)} onClick={() => editor.chain().focus().unsetLink().run()} title="Quitar enlace" aria-label="Quitar enlace">
            <Unlink className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {linkOpen ? (
        <div className="flex items-center gap-2 border-b border-border bg-secondary/20 px-2 py-1.5">
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
              if (e.key === "Escape") setLinkOpen(false);
            }}
            placeholder="https://… (seleccioná antes el texto)"
            className="h-8 flex-1 rounded-md border border-border bg-white px-2 text-sm outline-none focus:border-primary/60"
            aria-label="Dirección del enlace"
          />
          <button type="button" onClick={applyLink} className="h-8 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground">
            Aplicar
          </button>
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
