/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtAgo } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function GovernanceTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true); setError('');
    try {
      const result = await Promise.resolve(onAction?.('governance-approvals'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const approve = async (id: string) => {
    await Promise.resolve(onAction?.('governance-approve', { id }));
    void load();
  };

  const reject = async (id: string) => {
    await Promise.resolve(onAction?.('governance-reject', { id }));
    void load();
  };

  const items = asArray(data);

  return h(Section, {
    title: 'Governance', subtitle: `${items.length} pending approvals`,
    actions: h(ActionButton, { label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    items.length === 0 ? h(EmptyState, { title: 'No approvals', body: 'No pending approval requests.' }) :
    h('div', { className: 'grid gap-2' }, items.map((a: any, i: number) =>
      h('div', { key: a.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-3' },
        h('div', { className: 'min-w-0 flex-1' },
          h('div', { className: 'text-sm font-medium' }, a.title || a.action || a.type || a.id),
          h('div', { className: 'flex items-center gap-2 mt-1' },
            h(Badge, { status: a.status || 'pending' }),
            a.requestedBy ? h('span', { className: 'text-xs text-muted-foreground' }, `by ${a.requestedBy}`) : null,
            a.createdAt ? h('span', { className: 'text-xs text-muted-foreground' }, fmtAgo(a.createdAt)) : null,
          ),
        ),
        h('div', { className: 'flex gap-2' },
          h(ActionButton, { label: 'Approve', onClick: () => approve(a.id) }),
          h(ActionButton, { label: 'Reject', onClick: () => reject(a.id), variant: 'danger' }),
        ),
      ),
    )),
  );
}
