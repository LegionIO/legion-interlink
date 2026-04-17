/* eslint-disable @typescript-eslint/no-explicit-any */
import { h } from '../lib/react.js';
import { Badge, Section, JsonBox } from '../components/index.js';

export function DoctorTab({ pluginState }: any): any {
  return h(Section, {
    title: 'Doctor Results',
    subtitle: 'Most recent daemon diagnostics collected from the plugin.',
  },
  Array.isArray(pluginState?.doctorResults) && pluginState.doctorResults.length > 0
    ? h(
      'div',
      { className: 'space-y-2' },
      pluginState.doctorResults.map((entry: any) => h(
        'div',
        { key: `${entry.name}-${entry.duration}`, className: 'rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
        h('div', { className: 'flex items-center justify-between gap-3' },
          h('span', { className: 'text-sm font-medium' }, entry.name),
          h(Badge, { status: entry.status === 'pass' ? 'success' : entry.status }),
        ),
        h('p', { className: 'mt-1 text-xs text-muted-foreground' }, entry.message),
        h('p', { className: 'mt-2 text-[11px] text-muted-foreground' }, `${entry.duration}ms`),
      )),
    )
    : h('p', { className: 'text-sm text-muted-foreground' }, 'Run the doctor from settings or Mission Control to populate these checks.'));
}
