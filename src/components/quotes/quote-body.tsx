import { isHeadingLine, isRichText, sanitizeQuoteHtml, splitParagraphs } from "@/lib/quote-richtext";

/**
 * Único renderizador de cuerpo de módulo. Lo usan el documento real y el editor
 * de plantilla, así lo que se ve editando es exactamente lo que sale impreso.
 */
export function QuoteBody({ body }: { body: string }) {
  if (isRichText(body)) {
    return <div className="quote-doc__rt" dangerouslySetInnerHTML={{ __html: sanitizeQuoteHtml(body) }} />;
  }

  return (
    <>
      {splitParagraphs(body).map((chunk, index) => {
        const [first, ...rest] = chunk.split("\n");
        if (isHeadingLine(first) && rest.length > 0) {
          return (
            <div key={index} className="quote-doc__para mb-[3mm]">
              <p className="font-semibold tracking-[0.04em]">{first}</p>
              <p className="whitespace-pre-line text-justify">{rest.join("\n")}</p>
            </div>
          );
        }
        return (
          <p key={index} className="quote-doc__para mb-[3mm] whitespace-pre-line text-justify last:mb-0">
            {chunk}
          </p>
        );
      })}
    </>
  );
}
