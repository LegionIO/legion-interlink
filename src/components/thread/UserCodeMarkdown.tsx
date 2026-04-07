import { memo, type FC, type ReactNode } from 'react';
import { CodeBlock } from './CodeBlock';
import { parseUserCodeMarkdown } from '@/lib/userCodeMarkdown';

function renderPlainText(text: string): ReactNode[] {
  if (!text) return [];

  return text.split('\n').flatMap((line, index, lines) => {
    if (index === lines.length - 1) return [line];
    return [line, <br key={`br-${index}`} />];
  });
}

export const UserCodeMarkdown: FC<{ text: string; className?: string }> = memo(({ text, className }) => {
  const segments = parseUserCodeMarkdown(text);

  if (segments.length === 0) {
    return <span className={className} />;
  }

  return (
    <div className={className ?? 'whitespace-pre-wrap break-words text-sm leading-6 text-foreground'}>
      {segments.map((segment) => {
        if (segment.type === 'text') {
          return <span key={`${segment.type}-${segment.start}`}>{renderPlainText(segment.text)}</span>;
        }

        if (segment.type === 'inlineCode') {
          return (
            <code
              key={`${segment.type}-${segment.start}`}
              className="rounded bg-muted px-1.5 py-0.5 text-xs font-mono"
            >
              {segment.code}
            </code>
          );
        }

        return (
          <div key={`${segment.type}-${segment.start}`} className="my-2">
            <CodeBlock code={segment.code} language={segment.language || undefined} />
          </div>
        );
      })}
    </div>
  );
});
