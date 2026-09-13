"use client";

import { Fragment } from "react";

/**
 * Render mínimo del texto del asistente: negritas, listas y tablas de
 * comparación. Sin librerías de markdown: solo se soporta lo que el
 * asistente realmente escribe, y todo se renderiza como texto (nunca HTML),
 * así que un documento del fabricante no puede inyectar nada.
 */

function Inline({ text }: { text: string }) {
  // **negrita** es lo único que el prompt pide usar.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((part, index) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={index} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  );
}

function isTableRow(line: string): boolean {
  return line.trim().startsWith("|") && line.trim().endsWith("|");
}

function isSeparatorRow(line: string): boolean {
  return /^\s*\|[\s:|-]+\|\s*$/.test(line);
}

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((cell) => cell.trim());
}

function Table({ rows }: { rows: string[] }) {
  const body = rows.filter((row) => !isSeparatorRow(row)).map(splitRow);
  if (body.length === 0) return null;
  const [head, ...rest] = body;

  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[320px] border-collapse text-xs">
        <thead>
          <tr>
            {head.map((cell, index) => (
              <th
                key={index}
                className="border-b border-border px-2 py-1.5 text-left font-semibold text-foreground"
              >
                <Inline text={cell} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rest.map((row, rowIndex) => (
            <tr key={rowIndex} className="align-top">
              {row.map((cell, cellIndex) => (
                <td
                  key={cellIndex}
                  className="border-b border-border/60 px-2 py-1.5 text-muted-foreground"
                >
                  <Inline text={cell} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Block =
  | { kind: "p"; lines: string[] }
  | { kind: "list"; items: string[] }
  | { kind: "table"; rows: string[] };

function toBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let current: Block | null = null;

  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };

  for (const rawLine of text.split("\n")) {
    const line = rawLine.trimEnd();

    if (isTableRow(line)) {
      if (current?.kind !== "table") {
        flush();
        current = { kind: "table", rows: [] };
      }
      (current as Extract<Block, { kind: "table" }>).rows.push(line);
      continue;
    }

    const listMatch = line.match(/^\s*(?:[-*•]|\d+[.)])\s+(.*)$/);
    if (listMatch) {
      if (current?.kind !== "list") {
        flush();
        current = { kind: "list", items: [] };
      }
      (current as Extract<Block, { kind: "list" }>).items.push(listMatch[1]);
      continue;
    }

    if (!line.trim()) {
      flush();
      continue;
    }

    if (current?.kind !== "p") {
      flush();
      current = { kind: "p", lines: [] };
    }
    (current as Extract<Block, { kind: "p" }>).lines.push(line);
  }
  flush();
  return blocks;
}

export function RichAnswer({ text }: { text: string }) {
  const blocks = toBlocks(text);
  if (blocks.length === 0) return <p className="whitespace-pre-wrap">{text}</p>;

  return (
    <div className="space-y-2.5">
      {blocks.map((block, index) => {
        if (block.kind === "table") return <Table key={index} rows={block.rows} />;
        if (block.kind === "list") {
          return (
            <ul key={index} className="space-y-1.5">
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex} className="flex gap-2">
                  <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" />
                  <span className="min-w-0">
                    <Inline text={item} />
                  </span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={index} className="whitespace-pre-wrap">
            <Inline text={block.lines.join("\n")} />
          </p>
        );
      })}
    </div>
  );
}
