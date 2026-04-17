/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';

type Props = {
  label: string;
  value: any;
  subvalue?: any;
};

export function StatCard({ label, value, subvalue }: Props): any {
  return h(
    'div',
    { className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
    h('div', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
    h('div', { className: 'mt-1 text-xl font-semibold tracking-tight' }, value),
    subvalue ? h('div', { className: 'mt-1 text-xs text-muted-foreground' }, subvalue) : null,
  );
}
