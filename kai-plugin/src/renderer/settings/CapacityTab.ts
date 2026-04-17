/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { fmtNumber } from '../lib/utils.js';
import { Section, ActionButton, StatCard, KeyValueGrid, JsonBox } from '../components/index.js';

export function CapacityTab({ onAction }: { onAction: any }) {
  const [status, setStatus] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [s, f] = await Promise.all([
        Promise.resolve(onAction?.('capacity-status')),
        Promise.resolve(onAction?.('capacity-forecast')),
      ]);
      if (s?.ok === false) { setError(s.error || 'Failed'); return; }
      setStatus(s?.data ?? s);
      setForecast(f?.data ?? f);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  return h(Section, {
    title: 'Capacity', subtitle: 'Resource capacity and forecast',
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      status ? h('div', { className: 'grid grid-cols-2 gap-3 md:grid-cols-4' },
        h(StatCard, { label: 'Workers', value: fmtNumber(status.workers ?? status.totalWorkers) }),
        h(StatCard, { label: 'Active', value: fmtNumber(status.active ?? status.activeWorkers) }),
        h(StatCard, { label: 'Utilization', value: `${Math.round((status.utilization ?? 0) * 100)}%` }),
        h(StatCard, { label: 'Queue Depth', value: fmtNumber(status.queueDepth ?? status.pending ?? 0) }),
      ) : null,
      h('h4', { className: 'text-xs font-semibold uppercase tracking-wider text-muted-foreground' }, 'Forecast'),
      forecast ? h(JsonBox, { value: forecast }) : h('p', { className: 'text-sm text-muted-foreground' }, 'No forecast data.'),
    ),
  );
}
