/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function TenantsTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('tenants-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const items = asArray(data);

  return h(Section, {
    title: 'Tenants', subtitle: `${items.length} tenants`,
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    items.length === 0 ? h(EmptyState, { title: 'No tenants', body: 'No tenants registered.' }) :
    h('div', { className: 'grid gap-2' }, items.map((t: any, i: number) =>
      h('div', { key: t.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
        h('div', null,
          h('span', { className: 'text-sm font-medium' }, t.name || t.id),
          t.plan ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, t.plan) : null,
          t.createdAt ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, fmtAgo(t.createdAt)) : null,
        ),
        h(Badge, { status: t.status || (t.active !== false ? 'online' : 'disabled') }),
      ),
    )),
  );
}
