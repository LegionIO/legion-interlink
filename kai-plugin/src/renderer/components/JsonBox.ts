/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useMemo } from '../lib/react.js';
import { safeJson } from '../lib/utils.js';

type Props = {
  value: any;
  emptyLabel?: string;
};

export function JsonBox({ value, emptyLabel = 'No data yet.' }: Props): any {
  const text = useMemo(() => {
    if (value == null || value === '') return '';
    return safeJson(value);
  }, [value]);

  if (!text) {
    return h('p', { className: 'text-sm text-muted-foreground' }, emptyLabel);
  }

  return h(
    'pre',
    {
      className:
        'max-h-[420px] overflow-auto rounded-2xl border border-border/60 bg-background/55 p-4 text-xs text-foreground/90',
    },
    text,
  );
}
