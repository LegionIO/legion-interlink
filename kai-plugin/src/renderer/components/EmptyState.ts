/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';

type Props = {
  title: string;
  body: string;
};

export function EmptyState({ title, body }: Props): any {
  return h(
    'div',
    { className: 'rounded-3xl border border-dashed border-border/70 bg-card/25 px-6 py-12 text-center' },
    h('div', { className: 'text-sm font-medium' }, title),
    h('p', { className: 'mt-2 text-sm text-muted-foreground' }, body),
  );
}
