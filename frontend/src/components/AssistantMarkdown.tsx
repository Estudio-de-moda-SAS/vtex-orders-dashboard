import { Fragment, ReactNode } from 'react';

/**
 * Render mínimo del subconjunto de markdown que el manual del asistente le
 * pide usar (`backend/.../prompts/system-manual.ts`): negrita y listas con
 * "- ", nada más — así no hace falta una librería de markdown completa
 * (encabezados, tablas, links, código) que esta app no necesita.
 */
export function AssistantMarkdown({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);

  return (
    <>
      {blocks.map((block, blockIndex) => {
        const lines = block.split('\n').filter((line) => line.trim() !== '');
        const isList = lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line.trim()));

        if (isList) {
          return (
            <ul key={blockIndex} className="list-disc space-y-0.5 pl-5">
              {lines.map((line, lineIndex) => (
                <li key={lineIndex}>{renderInline(line.trim().replace(/^[-*]\s+/, ''))}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={blockIndex}>
            {block.split('\n').map((line, lineIndex, arr) => (
              <Fragment key={lineIndex}>
                {renderInline(line)}
                {lineIndex < arr.length - 1 && <br />}
              </Fragment>
            ))}
          </p>
        );
      })}
    </>
  );
}

/** Reemplaza `**negrita**` por `<strong>` — único énfasis que se pide usar. */
function renderInline(line: string): ReactNode[] {
  const parts = line.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    const match = part.match(/^\*\*([^*]+)\*\*$/);
    return match ? <strong key={index}>{match[1]}</strong> : <Fragment key={index}>{part}</Fragment>;
  });
}
