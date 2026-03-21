import { useState, useEffect, useRef, type FC } from 'react';
import { highlightBrandText } from '@/components/BrandText';

/**
 * Grid-overlay backdrop for the composer textarea.
 * Place this AND the textarea in the same CSS Grid cell (gridArea: '1/1').
 * The textarea renders with transparent text + visible caret.
 * This renders the same text with "Legion" gradient-highlighted.
 */
export const ComposerBackdrop: FC = () => {
  const [text, setText] = useState('');
  const [scrollTop, setScrollTop] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    let active = true;
    const sync = () => {
      if (!active) return;
      const textarea = document.querySelector('.legion-composer-grid textarea') as HTMLTextAreaElement | null;
      if (textarea) {
        const val = textarea.value;
        const st = textarea.scrollTop;
        setText((prev) => prev === val ? prev : val);
        setScrollTop((prev) => prev === st ? prev : st);
      }
      rafRef.current = requestAnimationFrame(sync);
    };
    rafRef.current = requestAnimationFrame(sync);
    return () => { active = false; cancelAnimationFrame(rafRef.current); };
  }, []);

  return (
    <div
      className="pointer-events-none select-none overflow-hidden whitespace-pre-wrap break-words text-sm py-1.5"
      style={{
        gridArea: '1 / 1',
        transform: `translateY(-${scrollTop}px)`,
        color: 'var(--foreground)',
        WebkitTextFillColor: 'var(--foreground)',
      }}
      aria-hidden
    >
      {text
        ? text.split('\n').map((line, i, arr) => (
            <span key={i}>
              {/legion/i.test(line) ? highlightBrandText(line) : line}
              {i < arr.length - 1 && '\n'}
            </span>
          ))
        : null}
    </div>
  );
};
