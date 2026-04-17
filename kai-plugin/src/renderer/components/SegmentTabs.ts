/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { cx } from '../lib/utils.js';

type Tab = {
  key: string;
  label: string;
};

type Props = {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
};

export function SegmentTabs({ tabs, active, onChange }: Props): any {
  return h(
    'div',
    { className: 'flex flex-wrap gap-2' },
    tabs.map((tab) =>
      h(
        'button',
        {
          key: tab.key,
          type: 'button',
          onClick: () => onChange(tab.key),
          className: cx(
            'rounded-full px-3 py-1.5 text-xs font-medium transition-colors',
            active === tab.key
              ? 'bg-primary text-primary-foreground'
              : 'border border-border/70 bg-card/40 text-muted-foreground hover:text-foreground',
          ),
        },
        tab.label,
      ),
    ),
  );
}
