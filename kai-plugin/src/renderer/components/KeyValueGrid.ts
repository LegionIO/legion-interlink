/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';

type Props = {
  items: [string, any][];
};

export function KeyValueGrid({ items }: Props): any {
  return h(
    'div',
    { className: 'grid gap-3 md:grid-cols-2 xl:grid-cols-3' },
    items.map(([label, value]) =>
      h(
        'div',
        {
          key: label,
          className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3',
        },
        h('div', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
        h('div', { className: 'mt-1 break-all text-sm font-medium' }, value),
      ),
    ),
  );
}
