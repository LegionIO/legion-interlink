/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';

type Props = {
  title: string;
  subtitle?: string;
  actions?: any;
  children?: any;
};

export function Section({ title, subtitle, actions, children }: Props): any {
  return h(
    'section',
    { className: 'rounded-3xl border border-border/70 bg-card/70 p-5 shadow-sm' },
    h(
      'div',
      { className: 'mb-4 flex flex-wrap items-start justify-between gap-3' },
      h(
        'div',
        null,
        h('h3', { className: 'text-sm font-semibold' }, title),
        subtitle ? h('p', { className: 'mt-1 text-xs text-muted-foreground' }, subtitle) : null,
      ),
      actions ? h('div', { className: 'flex flex-wrap gap-2' }, actions) : null,
    ),
    children,
  );
}
