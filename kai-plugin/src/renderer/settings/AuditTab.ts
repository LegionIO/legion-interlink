/* eslint-disable @typescript-eslint/no-explicit-any */
import { h, useState, useEffect } from '../lib/react.js';
import { asArray, fmtTime } from '../lib/utils.js';
import { Section, ActionButton, Badge, EmptyState } from '../components/index.js';

export function AuditTab({ onAction }: { onAction: any }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [verifyResult, setVerifyResult] = useState<any>(null);

  const load = async () => {
    setLoading(true); setError(''); setVerifyResult(null);
    try {
      const result = await Promise.resolve(onAction?.('audit-list'));
      result?.ok === false ? setError(result.error || 'Failed') : setData(result?.data ?? result);
    } catch (e: any) { setError(e?.message || String(e)); }
    finally { setLoading(false); }
  };

  useEffect(() => { void load(); }, []);

  const verify = async () => {
    try {
      const result = await Promise.resolve(onAction?.('audit-verify'));
      setVerifyResult(result?.data ?? result);
    } catch (e: any) { setVerifyResult({ error: e?.message || String(e) }); }
  };

  const items = asArray(data);

  return h(Section, {
    title: 'Audit Log', subtitle: `${items.length} entries`,
    actions: [
      h(ActionButton, { key: 'v', label: 'Verify Chain', onClick: verify }),
      h(ActionButton, { key: 'r', label: loading ? 'Refreshing...' : 'Refresh', onClick: load, disabled: loading, variant: 'secondary' }),
    ],
  },
    loading ? h('p', { className: 'text-sm text-muted-foreground' }, 'Loading...') :
    error ? h('div', { className: 'rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-600 dark:text-red-300' }, error) :
    h('div', { className: 'grid gap-3' },
      verifyResult ? h('div', { className: `rounded-2xl border px-4 py-3 text-sm ${verifyResult.valid || verifyResult.verified ? 'border-emerald-500/30 bg-emerald-500/5 text-emerald-600 dark:text-emerald-300' : 'border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300'}` },
        verifyResult.valid || verifyResult.verified ? 'Chain verification passed.' : `Verification failed: ${verifyResult.error || 'integrity mismatch'}`,
      ) : null,
      items.length === 0 ? h(EmptyState, { title: 'No audit entries', body: 'Audit log is empty.' }) :
      h('div', { className: 'grid gap-2' }, items.map((entry: any, i: number) =>
        h('div', { key: entry.id || i, className: 'flex items-center justify-between rounded-2xl border border-border/60 bg-background/45 px-4 py-2' },
          h('div', null,
            h('span', { className: 'text-sm font-medium' }, entry.action || entry.event || entry.type || `Entry ${i + 1}`),
            entry.actor ? h('span', { className: 'ml-2 text-xs text-muted-foreground' }, entry.actor) : null,
          ),
          h('span', { className: 'text-xs text-muted-foreground' }, fmtTime(entry.timestamp || entry.at)),
        ),
      )),
    ),
  );
}
