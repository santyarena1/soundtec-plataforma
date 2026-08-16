"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TextAlign from "@tiptap/extension-text-align";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Heading,
  Italic,
  List,
  ListOrdered,
} from "lucide-react";

type ToolProps = {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
};

function Tool({ active, disabled, label, onClick, children }: ToolProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40 ${
        active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
      }`}
    >
      {children}
    </button>
  );
}

export function QuoteFormatToolbar({ editor }: { editor: Editor }) {
  return (
    <div
      className="quote-doc__live-toolbar flex flex-wrap items-center gap-0.5 rounded-md border border-border bg-white px-1.5 py-1 shadow-md"
      onMouseDown={(event) => event.preventDefault()}
    >
      <Tool label="Negrita" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Itálica"
        active={editor.isActive("italic")}
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </Tool>
      <span className="mx-1 h-4 w-px bg-border" />
      <Tool
        label="Subtítulo"
        active={editor.isActive("heading", { level: 3 })}
        onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
      >
        <Heading className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Viñetas"
        active={editor.isActive("bulletList")}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Lista numerada"
        active={editor.isActive("orderedList")}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </Tool>
      <span className="mx-1 h-4 w-px bg-border" />
      <Tool
        label="Justificado"
        active={editor.isActive({ textAlign: "justify" })}
        onClick={() => editor.chain().focus().setTextAlign("justify").run()}
      >
        <AlignJustify className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Alinear a la izquierda"
        active={editor.isActive({ textAlign: "left" })}
        onClick={() => editor.chain().focus().setTextAlign("left").run()}
      >
        <AlignLeft className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Centrar"
        active={editor.isActive({ textAlign: "center" })}
        onClick={() => editor.chain().focus().setTextAlign("center").run()}
      >
        <AlignCenter className="h-3.5 w-3.5" />
      </Tool>
      <Tool
        label="Alinear a la derecha"
        active={editor.isActive({ textAlign: "right" })}
        onClick={() => editor.chain().focus().setTextAlign("right").run()}
      >
        <AlignRight className="h-3.5 w-3.5" />
      </Tool>
    </div>
  );
}

function FloatingToolbar({ editor }: { editor: Editor }) {
  const [pos, setPos] = useState<{ top: number; left: number; flip: boolean } | null>(null);

  useEffect(() => {
    const update = () => {
      if (!editor.isFocused) {
        setPos(null);
        return;
      }
      const { from, to } = editor.state.selection;
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(Math.max(from, to));
      const top = start.top - 8;
      const flip = top < 52;
      setPos({
        left: (start.left + end.left) / 2,
        top: flip ? end.bottom + 8 : top,
        flip,
      });
    };

    editor.on("selectionUpdate", update);
    editor.on("focus", update);
    editor.on("blur", () => {
      window.setTimeout(() => {
        if (!editor.isFocused) setPos(null);
      }, 120);
    });
    editor.on("transaction", update);
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    update();
    return () => {
      editor.off("selectionUpdate", update);
      editor.off("focus", update);
      editor.off("transaction", update);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [editor]);

  if (!pos || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="pointer-events-auto print:hidden"
      style={{
        position: "fixed",
        top: pos.top,
        left: pos.left,
        zIndex: 80,
        transform: pos.flip ? "translate(-50%, 0)" : "translate(-50%, -100%)",
      }}
    >
      <QuoteFormatToolbar editor={editor} />
    </div>,
    document.body
  );
}

const extensions = [
  StarterKit.configure({
    heading: { levels: [3] },
    codeBlock: false,
    blockquote: false,
    horizontalRule: false,
    code: false,
    link: false,
  }),
  TextAlign.configure({ types: ["heading", "paragraph"] }),
];

export function LiveRichText({
  value,
  onChange,
  onBlurSave,
  onFocusChange,
  ariaLabel,
  variant = "inline",
  readOnly = false,
}: {
  value: string;
  onChange: (html: string) => void;
  onBlurSave?: () => void;
  onFocusChange?: (focused: boolean) => void;
  ariaLabel?: string;
  variant?: "inline" | "boxed";
  readOnly?: boolean;
}) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: !readOnly,
    extensions,
    content: value,
    editorProps: {
      attributes: {
        class: "quote-doc__rt focus:outline-none",
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
      },
    },
    onUpdate: ({ editor: current }) => onChange(current.getHTML()),
    onFocus: () => onFocusChange?.(true),
    onBlur: () => {
      onFocusChange?.(false);
      onBlurSave?.();
    },
  });

  useEffect(() => {
    if (!editor) return;
    if (editor.isFocused) return;
    if (editor.getHTML() === value) return;
    editor.commands.setContent(value, { emitUpdate: false });
  }, [editor, value]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!readOnly);
  }, [editor, readOnly]);

  if (!editor) {
    return <div className="quote-doc__rt quote-doc__editor" aria-hidden />;
  }

  if (variant === "boxed") {
    return (
      <div>
        {!readOnly ? (
          <div className="border-b border-border bg-muted/40">
            <QuoteFormatToolbar editor={editor} />
          </div>
        ) : null}
        <EditorContent editor={editor} className="quote-doc__editor px-3 py-2" />
      </div>
    );
  }

  return (
    <>
      {!readOnly ? <FloatingToolbar editor={editor} /> : null}
      <EditorContent editor={editor} className="quote-doc__editor" />
    </>
  );
}
