import type { FC, ReactNode } from 'react';

/**
 * Replaces all occurrences of "Legion" (case-insensitive) in a string
 * with the branded AITHENA wordmark. Works inline within text.
 */
export function highlightBrandText(text: string): ReactNode[] {
  if (!text) return [text];
  const parts: ReactNode[] = [];
  const regex = /legion/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`j-${key++}`} className="legion-gradient-text legion-wordmark font-semibold">
        AITHENA
      </span>,
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}

/** Inline component: renders text with "Legion" highlighted */
export const BrandText: FC<{ children: string }> = ({ children }) => {
  return <>{highlightBrandText(children)}</>;
};
