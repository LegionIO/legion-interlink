/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtCurrency, fmtNumber } from '../lib/utils.js';
import { Section, ActionButton, StatCard, EmptyState } from '../components/index.js';

export function CostsTab({ onAction }: { onAction: any }) {
  const [metering, setMetering] = useState<any>(null);
  const [byModel, setByModel] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const [m, b] = await Promise.all([
        Promise.resolve(onAction?.('metering')),
        Promise.resolve(onAction?.('metering-by-model')),
      ]);
      if (m?.ok === false) { setError(m.error || 'Failed'); return; }
      setMetering(m?.data ?? m);
      setByModel(b?.data ?? b);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const models = asArray(byModel);

  return h(Section, {
    title: 'Costs', subtitle: 'Metering and cost breakdown by model',
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-4' },
      metering ? h('div', { className: 'grid grid-cols-2 gap-3 md:grid-cols-4' },
        h(StatCard, { label: 'Total Cost', value: fmtCurrency(metering.totalCost ?? metering.cost) }),
        h(StatCard, { label: 'Tokens', value: fmtNumber(metering.totalTokens ?? metering.tokens) }),
        h(StatCard, { label: 'Requests', value: fmtNumber(metering.totalRequests ?? metering.requests) }),
      ) : null,
      h('h4', { className: 'text-xs font-semibold uppercase tracking-wider text-muted-foreground' }, 'By Model'),
      models.length === 0 ? h(EmptyState, { title: 'No breakdown', body: 'No per-model metering data.' }) :
      h('div', { className: 'grid gap-2' }, models.map((m: any, i: number) =>
        h('div', { key: m.model || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
          h('div', null,
            h('span', { className: 'text-sm font-medium' }, m.model || m.name || `Model ${i + 1}`),
            h('span', { className: 'ml-2 text-xs text-muted-foreground' }, `${fmtNumber(m.tokens)} tokens`),
          ),
          h('span', { className: 'text-sm font-semibold' }, fmtCurrency(m.cost)),
        ),
      )),
    ),
  );
}
