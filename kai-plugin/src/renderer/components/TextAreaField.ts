/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
};

export function TextAreaField({ label, value, onChange, placeholder, rows = 5 }: Props): any {
  return h(
    'label',
    { className: 'grid gap-1.5' },
    h('span', { className: 'text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground' }, label),
    h('textarea', {
      value,
      onChange: (event: any) => onChange(event.target.value),
      placeholder,
      rows,
      className:
        'min-h-[120px] w-full rounded-2xl border border-border/70 bg-background/60 px-3 py-2 text-sm outline-none transition focus:border-primary/60',
    }),
  );
}
